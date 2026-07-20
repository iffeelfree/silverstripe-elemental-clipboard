<?php

namespace Ifeelfree\ElementalClipboard;

use DNADesign\Elemental\Models\BaseElement;
use DNADesign\Elemental\Models\ElementalArea;
use SilverStripe\Control\Controller;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Dev\FixtureFactory;
use SilverStripe\Dev\YamlFixture;
use SilverStripe\ORM\HasManyList;
use SilverStripe\Security\SecurityToken;
use SilverStripe\Versioned\Versioned;
use Symfony\Component\Yaml\Yaml;

/**
 * ElementClipboardController
 *
 * Copy/paste elemental blocks between pages.
 * No external dependencies — uses SilverStripe framework core only.
 *
 * The clipboard format is a populate-compatible fixture array stored in
 * browser localStorage — the same YAML format as populate_content.yml.
 *
 * Routes (registered in _config/elementclipboard.yml):
 *   GET  /admin/elementclipboard/export?elementID=X&SecurityID=Y
 *   POST /admin/elementclipboard/import  { areaID, parcel, SecurityID }
 *   GET  /admin/elementclipboard/exportyaml?areaID=X&SecurityID=Y
 *
 * ── Extending for new element types ──────────────────────────────────────
 * Declare in your element class — nothing else needs to change:
 *
 *   // Export only these fields (default: all $db fields)
 *   private static array $clipboard_fields = ['HTML', 'ExtraClass'];
 *
 *   // Exclude specific fields from the auto-export
 *   private static array $clipboard_exclude = ['InternalNotes'];
 *
 *   // Skip specific has_many / many_many relations from auto-discovery
 *   private static array $clipboard_exclude_relations = ['Tags', 'LinkTracking'];
 */
class ElementClipboardController extends Controller
{
    private static string $url_segment = 'admin/elementclipboard';

    private static array $url_handlers = [
        'GET export'     => 'export',
        'GET exportall'  => 'exportall',
        'GET exportyaml' => 'exportyaml',
        'POST import'    => 'import',
    ];

    private static array $allowed_actions = [
        'export',
        'exportall',
        'exportyaml',
        'import',
    ];

    // -------------------------------------------------------------------------
    // EXPORT — single element → JSON parcel for localStorage
    // -------------------------------------------------------------------------

    public function export(HTTPRequest $request): HTTPResponse
    {
        if (!SecurityToken::inst()->checkRequest($request)) {
            return $this->jsonError(400, 'Invalid security token');
        }

        $element = BaseElement::get_by_id((int) $request->getVar('elementID'));

        if (!$element || !$element->canView()) {
            return $this->jsonError(404, 'Element not found');
        }

        $area     = ElementalArea::get_by_id($element->ParentID);
        $page     = $area?->getOwnerPage();
        $manyMany = $this->buildManyMany($element);

        return $this->jsonResponse([
            'ss_clipboard_version' => 1,
            'exported_at'          => date('c'),
            'source_page_title'    => $page?->Title ?? 'Unknown page',
            'source_element_title' => $element->Title,
            'fixture'              => $this->buildFixture($element),
            'many_many'            => $manyMany ?: null,
        ]);
    }

    // -------------------------------------------------------------------------
    // EXPORT ALL — whole area → single JSON parcel for localStorage
    //
    // Same fixture format as a single-element export — the fixture key just
    // contains multiple records so the existing import path handles it as-is.
    // -------------------------------------------------------------------------

    public function exportall(HTTPRequest $request): HTTPResponse
    {
        if (!SecurityToken::inst()->checkRequest($request)) {
            return $this->jsonError(400, 'Invalid security token');
        }

        $area = ElementalArea::get_by_id((int) $request->getVar('areaID'));

        if (!$area || !$area->canView()) {
            return $this->jsonError(404, 'Area not found');
        }

        $page     = $area->getOwnerPage();
        $fixture  = [];
        $manyMany = [];
        $count    = 0;

        foreach ($area->Elements()->sort('Sort') as $element) {
            $fixture  = array_merge_recursive($fixture, $this->buildFixture($element));
            $manyMany = array_merge($manyMany, $this->buildManyMany($element));
            $count++;
        }

        return $this->jsonResponse([
            'ss_clipboard_version' => 1,
            'exported_at'          => date('c'),
            'source_page_title'    => $page?->Title ?? 'Unknown page',
            'source_element_title' => "Layout: {$page?->Title} ({$count} blocks)",
            'fixture'              => $fixture,
            'many_many'            => $manyMany ?: null,
        ]);
    }

    // -------------------------------------------------------------------------
    // EXPORT YAML — whole area → downloadable .yml
    //
    // Same format as populate_content.yml — commit as a starter layout,
    // share between environments, or re-import via the import endpoint.
    // Replace __target_area__ with a real ElementalAreaID before using
    // with silverstripe-populate directly.
    // -------------------------------------------------------------------------

    public function exportyaml(HTTPRequest $request): HTTPResponse
    {
        if (!SecurityToken::inst()->checkRequest($request)) {
            return $this->jsonError(400, 'Invalid security token');
        }

        $area = ElementalArea::get_by_id((int) $request->getVar('areaID'));

        if (!$area || !$area->canView()) {
            return $this->jsonError(404, 'Area not found');
        }

        $page    = $area->getOwnerPage();
        $label   = $page?->Title ?? "area-{$area->ID}";
        $fixture = [];

        foreach ($area->Elements()->sort('Sort') as $element) {
            $fixture = array_merge_recursive($fixture, $this->buildFixture($element));
        }

        $yaml = "# Layout: {$label}\n"
              . "# Exported: " . date('Y-m-d H:i:s') . "\n"
              . "# Replace __target_area__ with your ElementalAreaID before running populate\n\n"
              . Yaml::dump($fixture, 4, 2);

        $filename = 'layout-' . preg_replace('/[^a-z0-9]+/', '-', strtolower($label)) . '.yml';

        return HTTPResponse::create($yaml, 200)
            ->addHeader('Content-Type', 'application/x-yaml')
            ->addHeader('Content-Disposition', "attachment; filename=\"{$filename}\"");
    }

    // -------------------------------------------------------------------------
    // IMPORT — fixture parcel → write to target ElementalArea
    //
    // Uses YamlFixture + FixtureFactory from silverstripe/framework core.
    // No external dependencies. Handles => cross-references and Versioned
    // publishing automatically — same engine SS uses for test fixtures.
    // -------------------------------------------------------------------------

    public function import(HTTPRequest $request): HTTPResponse
    {
        if (!SecurityToken::inst()->checkRequest($request)) {
            return $this->jsonError(400, 'Invalid security token');
        }

        $raw  = $request->getBody() ?: (string) file_get_contents('php://input');
        $body = json_decode($raw, true);

        if (!isset($body['areaID'], $body['parcel']['fixture'])) {
            return $this->jsonError(400, 'Missing areaID or fixture');
        }

        // Read from draft stage so unpublished pages/areas are editable
        $area = Versioned::get_by_stage(ElementalArea::class, Versioned::DRAFT)
            ->byID((int) $body['areaID']);

        if (!$area || !$area->canEdit()) {
            return $this->jsonError(403, 'Cannot edit this area');
        }

        $fixture = $this->resolveTargetArea($body['parcel']['fixture'], $area);
        $fixture = $this->offsetSort($fixture, (int) $area->Elements()->max('Sort'));

        // YamlFixture accepts a raw YAML string (no temp file needed).
        // FixtureFactory is in silverstripe/framework core — no populate required.
        $yaml    = Yaml::dump($fixture, 4, 2);
        $factory = Injector::inst()->create(FixtureFactory::class);
        (new YamlFixture($yaml))->writeInto($factory);

        if (!empty($body['parcel']['many_many'])) {
            $this->importManyMany($factory, $body['parcel']['many_many']);
        }

        return $this->jsonResponse(['success' => true]);
    }

    // -------------------------------------------------------------------------
    // BUILD FIXTURE
    //
    // Produces a populate-compatible fixture array for one element, e.g:
    //
    //   DNADesign\Elemental\Models\ElementContent:
    //     elementcontent-intro-42:
    //       Title: "Introduction"
    //       ParentID: "__target_area__"   ← resolved at import time
    //       Sort: 2
    //       HTML: "<h2>...</h2>"
    //
    //   Dynamic\Elements\Accordion\Model\AccordionPanel:
    //     elementaccordion-faq-7-panels-1:
    //       Title: "Shipping"
    //       AccordionID: =>Dynamic\Elements\Accordion\Elements\ElementAccordion.elementaccordion-faq-7
    //
    // has_many children are recreated as new records on import. The child's
    // reverse has_one FK (ParentID, AccordionID, …) is resolved via HasManyList
    // — never assumed to be ParentID.
    // -------------------------------------------------------------------------

    protected function buildFixture(BaseElement $element): array
    {
        $className = $element->ClassName;
        $key       = $this->fixtureKey($element);

        // Base record — fixed structural fields first, then all auto-discovered ones
        $record = [
            'Title'      => $element->Title,
            'ShowTitle'  => (int) $element->ShowTitle,
            'ExtraClass' => $element->ExtraClass,
            'Sort'       => $element->Sort,
            'ParentID'   => '__target_area__',
        ];

        foreach ($this->getFieldsForClass($className, ['ParentID', 'Sort', 'Title', 'ShowTitle', 'ExtraClass']) as $field) {
            $record[$field] = $element->$field;
        }

        $fixture = [$className => [$key => $record]];

        // has_many — auto-discovered, opt-out via $clipboard_exclude_relations
        $excludeRels = $className::config()->get('clipboard_exclude_relations') ?? [];

        foreach ($className::config()->get('has_many') ?? [] as $relationName => $relClass) {
            if (in_array($relationName, $excludeRels, true)) {
                continue;
            }

            // Resolve 'ClassName.RelationName' notation to just the class
            $relClass = strpos($relClass, '.') !== false
                ? explode('.', $relClass)[0]
                : $relClass;

            if (!class_exists($relClass)) {
                continue;
            }

            $list = $element->$relationName();
            if (!$list instanceof HasManyList) {
                continue;
            }

            // AccordionID, ParentID, etc. — whatever the child's has_one is called
            $foreignKey  = $list->getForeignKey();
            $childFields = $this->getFieldsForClass($relClass, [$foreignKey]);
            $dbFields    = $relClass::config()->get('db') ?? [];
            $i           = 1;

            // Preserve GridFieldOrderableRows order when the child has Sort
            $children = isset($dbFields['Sort']) ? $list->sort('Sort') : $list;

            foreach ($children as $child) {
                $childKey    = "{$key}-" . strtolower($relationName) . "-{$i}";
                $childRecord = [$foreignKey => "=>{$className}.{$key}"];

                foreach ($childFields as $field) {
                    $childRecord[$field] = $child->$field;
                }

                // Sort is excluded from getFieldsForClass (elements use offsetSort),
                // but has_many children need their own order preserved.
                if (isset($dbFields['Sort'])) {
                    $childRecord['Sort'] = (int) $child->Sort;
                }

                $fixture[$relClass][$childKey] = $childRecord;
                $i++;
            }
        }

        return $fixture;
    }

    // -------------------------------------------------------------------------
    // BUILD MANY-MANY DATA
    //
    // Collects child records for many_many relations declared via
    // $clipboard_many_many on the element class. Returns an array keyed by
    // fixture key so the importer can look up the parent ID from the factory:
    //
    //   [
    //     'elementpromos-promo-test-3' => [
    //       'class'  => 'Dynamic\...\ElementPromos',
    //       'Promos' => [
    //         ['Title' => 'X', 'Content' => '...', 'ShowTitle' => 0],
    //       ],
    //     ],
    //   ]
    // -------------------------------------------------------------------------

    protected function buildManyMany(BaseElement $element): array
    {
        $className   = $element->ClassName;
        $key         = $this->fixtureKey($element);
        $excludeRels = $className::config()->get('clipboard_exclude_relations') ?? [];
        $manyMany    = $className::config()->get('many_many') ?? [];

        if (empty($manyMany)) {
            return [];
        }

        $data        = ['class' => $className];
        $extraFields = $className::config()->get('many_many_extraFields') ?? [];
        $hasData     = false;

        foreach ($manyMany as $relationName => $relSpec) {
            if (in_array($relationName, $excludeRels, true)) {
                continue;
            }

            // many_many can be a plain class name or a through-object array
            $relClass = is_array($relSpec) ? ($relSpec['to'] ?? null) : $relSpec;
            if (!$relClass || !class_exists($relClass)) {
                continue;
            }

            $list      = $element->$relationName();
            $joinExtra = $extraFields[$relationName] ?? [];

            if (isset($joinExtra['SortOrder'])) {
                $list = $list->sort('SortOrder');
            }

            $childFields = $this->getFieldsForClass($relClass);
            $children    = [];

            foreach ($list as $child) {
                $childRecord = [];
                foreach ($childFields as $field) {
                    $childRecord[$field] = $child->$field;
                }
                $children[] = $childRecord;
            }

            $data[$relationName] = $children;
            $hasData             = true;
        }

        return $hasData ? [$key => $data] : [];
    }

    // -------------------------------------------------------------------------
    // IMPORT MANY-MANY DATA
    //
    // After YamlFixture::writeInto() has created the parent element, look up
    // its new DB ID via the factory and create + link each child record.
    // -------------------------------------------------------------------------

    protected function importManyMany(FixtureFactory $factory, array $manyMany): void
    {
        foreach ($manyMany as $fixtureKey => $data) {
            $className = $data['class'] ?? null;
            if (!$className) {
                continue;
            }

            $parentID = $factory->getId($className, $fixtureKey);
            if (!$parentID) {
                continue;
            }

            /** @var BaseElement $parent */
            $parent = $className::get_by_id($parentID);
            if (!$parent) {
                continue;
            }

            $extraFieldsMap = $className::config()->get('many_many_extraFields') ?? [];

            foreach ($data as $relationName => $children) {
                if ($relationName === 'class' || !is_array($children)) {
                    continue;
                }

                $relClass   = $parent->$relationName()->dataClass();
                $extraFields = $extraFieldsMap[$relationName] ?? [];

                foreach ($children as $i => $childData) {
                    $child = $relClass::create($childData);
                    $child->write();

                    $joinData = isset($extraFields['SortOrder']) ? ['SortOrder' => $i + 1] : [];
                    $parent->$relationName()->add($child, $joinData);
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // Replace __target_area__ placeholder with the real ElementalArea ID
    // -------------------------------------------------------------------------

    protected function resolveTargetArea(array $fixture, ElementalArea $area): array
    {
        array_walk_recursive($fixture, function (&$value) use ($area) {
            if ($value === '__target_area__') {
                $value = $area->ID;
            }
        });

        return $fixture;
    }

    // -------------------------------------------------------------------------
    // Offset Sort so pasted blocks land at the bottom of the area
    // -------------------------------------------------------------------------

    protected function offsetSort(array $fixture, int $currentMax): array
    {
        foreach ($fixture as $className => &$records) {
            if (!is_subclass_of($className, BaseElement::class)) {
                continue;
            }
            foreach ($records as &$record) {
                if (isset($record['Sort'])) {
                    $record['Sort'] += $currentMax;
                }
            }
        }

        return $fixture;
    }

    // -------------------------------------------------------------------------
    // Auto-discover copyable fields for any DataObject class.
    //
    // Returns all $db column names + $has_one *ID columns, minus any fields
    // in $always_exclude or the caller-supplied $extra_exclude list.
    //
    // Fields that are always skipped regardless of config:
    //   Version, Sort (Sort is set by offsetSort), ClassName, RecordClassName
    // -------------------------------------------------------------------------

    protected function getFieldsForClass(string $className, array $extraExclude = []): array
    {
        $alwaysExclude = ['Version', 'Sort', 'ClassName', 'RecordClassName'];

        // All $db columns declared on this class and its parents
        $db = array_keys($className::config()->get('db') ?? []);

        // has_one foreign-key columns (e.g. ImageID, ElementLinkID)
        $hasOneIDs = array_map(
            fn($rel) => "{$rel}ID",
            array_keys($className::config()->get('has_one') ?? [])
        );

        $all = array_unique(array_merge($db, $hasOneIDs));

        return array_values(array_diff($all, $alwaysExclude, $extraExclude));
    }

    // -------------------------------------------------------------------------
    // Stable readable fixture key — e.g. "elementcontent-intro-42"
    // -------------------------------------------------------------------------

    protected function fixtureKey(BaseElement $element): string
    {
        $parts      = explode('\\', $element->ClassName);
        $shortClass = strtolower(end($parts));
        $slug       = preg_replace('/[^a-z0-9]+/', '-', strtolower($element->Title ?? ''));
        $slug       = trim($slug, '-') ?: 'block';

        return "{$shortClass}-{$slug}-{$element->ID}";
    }

    // -------------------------------------------------------------------------
    // Response helpers
    // -------------------------------------------------------------------------

    protected function jsonResponse(array $data, int $status = 200): HTTPResponse
    {
        return HTTPResponse::create(json_encode($data), $status)
            ->addHeader('Content-Type', 'application/json');
    }

    protected function jsonError(int $status, string $message): HTTPResponse
    {
        return $this->jsonResponse(['error' => $message], $status);
    }
}
