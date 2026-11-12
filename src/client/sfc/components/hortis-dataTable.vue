<script src="../../js/i6/imerss-core.js"></script>
<style src="../../css/data-table.css"></style>
<script>
"use strict";

// A table of rows, sortable by column and with a selectable row if configured, of which only the rows near the
// scrolled position are rendered, with spacers standing for the rest -
// ported to Infusion 6 from data-table.js. Unlike the Infusion 4 table, which measured and rewrote its DOM as it
// scrolled, the scrolled position and the height of the view are members, written by a listener bound to the scrolled
// element, and the window of rows rendered is computed from them. Rendered under node, where nothing is laid out,
// the table shows its first block of rows.
fluid.def("hortis.dataTable", {
    $layers: "fluid.component",
    // rows: Object[]
    // Each with members `key` and `label`, and optionally `numeric`, `width` and `formatter`, the global name of a
    // function rendering a cell's value - by default, one column for each member of the first row
    columns: [],
    sortable: false,
    rowSelectable: false,
    minBlockSize: 20,
    sortColumn: null,
    sortDirection: 1,
    // The selected row, if any. A table whose selection is held elsewhere, e.g. by hortis.libreMap.recordSelector,
    // overrides this with a reference to it, and `selectRow` with a method writing it
    selectedRow: null,
    // Whether clicking anywhere on a row selects it, besides its checkbox - clicking the selected row deselects it
    selectOnRowClick: true,
    selectRow: "$method:hortis.dataTable.selectRow({self}, {0}:row)",
    // Written by the listener tracking the scrolled element
    scrollTop: 0,
    viewHeight: 0,
    rowHeight: 26.5,
    // The least change in the measured height of a row for which `rowHeight` is updated. Rows differ in height by a
    // fraction of a pixel, by their content and the display's scaling, and since every row not rendered is reckoned at
    // `rowHeight`, following each such difference would change the height of a long table by thousands of pixels
    rowHeightTolerance: 0.5,
    resolvedColumns: "$compute:hortis.dataTable.resolveColumns({self}.rows, {self}.columns)",
    displayRows: "$compute:hortis.dataTable.sortRows({self}.rows, {self}.sortColumn, {self}.sortDirection)",
    window: "$compute:hortis.dataTable.window({self}.displayRows.length, {self}.scrollTop, {self}.viewHeight, {self}.rowHeight, {self}.minBlockSize)",
    pageInfo: "$compute:hortis.dataTable.pageInfo({self}.window)",
    head: {
        $component: {
            $layers: "hortis.verbatimSlot",
            markup: `$compute:hortis.dataTable.headMarkup({dataTable}.resolvedColumns, {dataTable}.sortable, {dataTable}.rowSelectable,
                {dataTable}.sortColumn, {dataTable}.sortDirection)`
        }
    },
    body: {
        $component: {
            $layers: "hortis.verbatimSlot",
            markup: `$compute:hortis.dataTable.bodyMarkup({dataTable}.displayRows, {dataTable}.resolvedColumns, {dataTable}.window,
                {dataTable}.rowHeight, {dataTable}.rowSelectable, {dataTable}.selectedRow)`
        }
    },
    tracker: {
        $bindable: {
            bind: "hortis.dataTable.track({self}, {self}.view.renderedContainer, {global}.window)",
            unbind: "hortis.dataTable.untrack({boundValue})"
        }
    }
});

hortis.dataTable.encode = function (text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
};

/**
 * Determine the columns of a table - those configured, or else one for each member of its first row.
 * @param {Object[]} rows - The rows
 * @param {Object[]} columns - The configured columns, each with members `key` and `label`, and optionally `numeric`
 * and `width`
 * @return {Object[]} The columns
 */
hortis.dataTable.resolveColumns = function (rows, columns) {
    return columns.length > 0 ? columns : rows[0] ? Object.keys(rows[0]).map(key => ({key, label: key})) : [];
};

/**
 * Sort rows by a column, without disturbing the original array.
 * @param {Object[]} rows - The rows
 * @param {String|null} sortColumn - The key of the column sorted by, or null if the rows are unsorted
 * @param {Number} sortDirection - 1 for ascending, -1 for descending
 * @return {Object[]} The rows in their displayed order
 */
hortis.dataTable.sortRows = function (rows, sortColumn, sortDirection) {
    const compare = (a, b) => {
        const av = a[sortColumn] ?? "", bv = b[sortColumn] ?? "";
        return av < bv ? -sortDirection : av > bv ? sortDirection : 0;
    };
    return sortColumn ? rows.slice().sort(compare) : rows;
};

/**
 * Compute the window of rows to be rendered. Rows are rendered in blocks of at least `minBlockSize`, a block either
 * side of the one in view, so that the rendering changes only when scrolling crosses a block.
 * @param {Number} total - The number of rows
 * @param {Number} scrollTop - The scrolled position of the table, in pixels
 * @param {Number} viewHeight - The height of the table's view of its rows, in pixels, or 0 if it is not laid out
 * @param {Number} rowHeight - The height of a row, in pixels
 * @param {Number} minBlockSize - The minimum number of rows in a block
 * @return {Object} The window, with members `start` and `end`, the rows rendered, `first` and `last`, the rows in view,
 * and `atStart` and `atEnd`
 */
hortis.dataTable.window = function (total, scrollTop, viewHeight, rowHeight, minBlockSize) {
    const rowsPerView = Math.max(Math.floor(viewHeight / rowHeight), 1);
    const blockSize = Math.max(rowsPerView, minBlockSize);
    const first = Math.min(Math.max(Math.ceil((scrollTop - 1) / rowHeight), 0), Math.max(total - 1, 0));
    const block = Math.floor(first / blockSize);
    const last = Math.min(first + (viewHeight > 0 ? rowsPerView : minBlockSize), total);
    return {
        start: Math.max(block - 1, 0) * blockSize,
        end: Math.min((block + 3) * blockSize, total),
        first, last, rowsPerView, total,
        atStart: first === 0,
        atEnd: last >= total
    };
};

hortis.dataTable.sortIconId = function (key, sortColumn, sortDirection) {
    return key !== sortColumn ? "sortable" : sortDirection === 1 ? "sort-ascending" : "sort-descending";
};

/**
 * Render the head of a table.
 * @param {Object[]} columns - The columns
 * @param {Boolean} sortable - Whether the columns may be sorted by
 * @param {Boolean} rowSelectable - Whether a row may be selected
 * @param {String|null} sortColumn - The key of the column sorted by
 * @param {Number} sortDirection - The direction of sorting
 * @return {String} The markup of the head's row, rendered within the table's `thead`
 */
hortis.dataTable.headMarkup = function (columns, sortable, rowSelectable, sortColumn, sortDirection) {
    const cells = columns.map(col => {
        const cls = col.numeric ? " class=\"hortis-dataTable-num\"" : "";
        const style = col.width ? ` style="width:${col.width}"` : "";
        const label = hortis.dataTable.encode(col.label);
        const icon = sortable ? `<button class="hortis-dataTable-sort" data-key="${hortis.dataTable.encode(col.key)}" aria-label="Sort by ${label}">` +
            `<svg class="hortis-dataTable-icon"><use href="#${hortis.dataTable.sortIconId(col.key, sortColumn, sortDirection)}"/></svg></button>` : "";
        return `<th${cls}${style}><div class="hortis-dataTable-sort-wrap">${label}${icon}</div></th>`;
    }).join("");
    return "<tr>" + (rowSelectable ? "<th class=\"hortis-dataTable-select-cell\"></th>" : "") + cells + "</tr>";
};

/**
 * Render a cell's value - a string which is a URL is rendered as a link.
 * @param {Object} col - The cell's column, which may hold a `formatter` accepting the value and its row
 * @param {Object} row - The cell's row
 * @return {String} The markup of the cell's content
 */
hortis.dataTable.renderCell = function (col, row) {
    const raw = row[col.key];
    const encoded = hortis.dataTable.encode(raw ?? "");
    return col.formatter ? fluid.getGlobalValue(col.formatter)(raw, row) :
        /^https?:\/\//.test(encoded) ? `<a href="${encoded}" target="_blank">${encoded}</a>` : encoded;
};

/**
 * Render the body of a table - the rows of its window, between spacers standing for the rows before and after it.
 * @param {Object[]} rows - The rows in their displayed order
 * @param {Object[]} columns - The columns
 * @param {Object} window - The window of rows rendered, as computed by `hortis.dataTable.window`
 * @param {Number} rowHeight - The height of a row, in pixels
 * @param {Boolean} rowSelectable - Whether a row may be selected
 * @param {Object|null} selectedRow - The selected row, if any
 * @return {String} The markup of the body's rows, rendered within the table's `tbody`
 */
hortis.dataTable.bodyMarkup = function (rows, columns, window, rowHeight, rowSelectable, selectedRow) {
    const columnCount = columns.length + (rowSelectable ? 1 : 0);
    const spacer = height => height > 0 ? `<tr class="hortis-dataTable-spacer" style="height:${height}px"><td colspan="${columnCount}"></td></tr>` : "";
    const body = rows.slice(window.start, window.end).map((row, i) => {
        const index = window.start + i;
        const selected = row === selectedRow;
        const check = rowSelectable ? `<td class="hortis-dataTable-select-cell"><input type="checkbox" class="hortis-dataTable-row-check" data-row-index="${index}"${selected ? " checked" : ""}/></td>` : "";
        const cells = columns.map(col => `<td${col.numeric ? " class=\"hortis-dataTable-num\"" : ""}>${hortis.dataTable.renderCell(col, row)}</td>`).join("");
        const rowAttrs = rowSelectable ? ` data-row-index="${index}" class="hortis-dataTable-selectable-row${selected ? " hortis-dataTable-selected-row" : ""}"` : "";
        return `<tr${rowAttrs}>${check}${cells}</tr>`;
    }).join("");
    return spacer(window.start * rowHeight) + body + spacer((window.total - window.end) * rowHeight);
};

hortis.dataTable.pageInfo = function (window) {
    return window.total > 0 ? `${window.first + 1}–${window.last} of ${window.total}` : "No data";
};

/**
 * Measure the height of the rows rendered in a table's scrolled element, as their mean, since they may differ by a
 * fraction of a pixel.
 * @param {Element} scrollEl - The table's scrolled element
 * @return {Number} The mean height of the rendered rows, or 0 if none is rendered
 */
hortis.dataTable.measureRowHeight = function (scrollEl) {
    const rows = scrollEl.querySelectorAll("tbody tr:not(.hortis-dataTable-spacer)");
    const first = rows[0], last = rows[rows.length - 1];
    return rows.length > 0 ? (last.getBoundingClientRect().bottom - first.getBoundingClientRect().top) / rows.length : 0;
};

/**
 * Track the scrolled position and the height of the view of a table's scrolled element, writing them into the table
 * on each animation frame in which they change, and the height of its head into the element's CSS variable
 * --data-table-head-height.
 * The table's `rowHeight`, by which the heights of the spacers standing for the rows not rendered are reckoned, is
 * corrected only when the rows' measured height departs from it by more than `rowHeightTolerance`, and never whilst
 * the pointer is pressed within the scrolled element. A change of `rowHeight` changes the height of the whole table,
 * and whilst the scrollbar's thumb is dragged, the browser holds the thumb at the pointer by moving the scrolled
 * position in proportion - which rendered other rows, measured afresh, in a loop which ran the table to its end. Once
 * `rowHeight` is corrected, the scrolled position is moved so that the same row stays at the top of the view.
 * @param {hortis.dataTable} that - The table
 * @param {Element} container - The table's rendered container
 * @param {Window} window - The window holding the table
 * @return {Object} A record of the listeners, to be supplied to `hortis.dataTable.untrack`
 */
hortis.dataTable.track = function (that, container, window) {
    const scrollEl = container.querySelector(".hortis-dataTable-scroll");
    let frame = null;
    // Whether the pointer is pressed within the scrolled element, e.g. dragging its scrollbar's thumb
    let pressed = false;
    const update = () => {
        frame = null;
        const theadHeight = scrollEl.querySelector("thead")?.getBoundingClientRect().height || 0;
        // Confines the vertical scrollbar's track to the rows, beneath the sticky head - see data-table.css
        scrollEl.style.setProperty("--data-table-head-height", theadHeight + "px");
        const rowHeight = hortis.dataTable.measureRowHeight(scrollEl);
        if (!pressed && rowHeight > 0 && Math.abs(rowHeight - that.rowHeight) > that.rowHeightTolerance) {
            const topRow = scrollEl.scrollTop / that.rowHeight;
            that.rowHeight = rowHeight;
            scrollEl.scrollTop = topRow * rowHeight;
        }
        that.scrollTop = scrollEl.scrollTop;
        that.viewHeight = Math.max(scrollEl.clientHeight - theadHeight, 0);
    };
    const schedule = () => {
        if (!frame) {
            frame = window.requestAnimationFrame(update);
        }
    };
    const press = () => {
        pressed = true;
    };
    const release = () => {
        if (pressed) {
            pressed = false;
            schedule();
        }
    };
    scrollEl.addEventListener("scroll", schedule);
    scrollEl.addEventListener("pointerdown", press);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    const observer = new window.ResizeObserver(schedule);
    observer.observe(scrollEl);
    return {scrollEl, schedule, press, release, observer, window, cancel: () => frame && window.cancelAnimationFrame(frame)};
};

hortis.dataTable.untrack = function (record) {
    record.scrollEl.removeEventListener("scroll", record.schedule);
    record.scrollEl.removeEventListener("pointerdown", record.press);
    record.window.removeEventListener("pointerup", record.release);
    record.window.removeEventListener("pointercancel", record.release);
    record.observer.disconnect();
    record.cancel();
};

hortis.dataTable.selectRow = function (that, row) {
    that.selectedRow = row;
};

/**
 * Handle a click within a table - on a column's sort button, a row's checkbox, a selectable row, or a navigation
 * button. A click on a link or other control within a row is left to it.
 * @param {Event} event - The click event
 * @param {hortis.dataTable} that - The table
 */
hortis.dataTable.click = function (event, that) {
    const sort = event.target.closest(".hortis-dataTable-sort");
    const check = event.target.closest(".hortis-dataTable-row-check");
    const move = event.target.closest("[data-move]");
    const rowEl = event.target.closest("tr[data-row-index]");
    if (sort) {
        const key = sort.dataset.key;
        that.sortDirection = that.sortColumn === key ? -that.sortDirection : 1;
        that.sortColumn = key;
    } else if (check) {
        that.selectRow(check.checked ? that.displayRows[+check.dataset.rowIndex] : null);
    } else if (rowEl && that.selectOnRowClick && !event.target.closest("a, button, input, select, label")) {
        const row = that.displayRows[+rowEl.dataset.rowIndex];
        that.selectRow(row === that.selectedRow ? null : row);
    } else if (move) {
        hortis.dataTable.navigate(that, event.target.closest(".hortis-dataTable-wrap").querySelector(".hortis-dataTable-scroll"), move.dataset.move);
    }
};

hortis.dataTable.navigate = function (that, scrollEl, move) {
    const window = that.window;
    const targets = {
        start: 0,
        prev: (window.first - window.rowsPerView) * that.rowHeight,
        next: (window.first + window.rowsPerView) * that.rowHeight,
        end: scrollEl.scrollHeight
    };
    scrollEl.scrollTop = targets[move];
};
</script>

<template>
    <div class="hortis-dataTable-wrap" @onclick="hortis.dataTable.click({0}, {self})">
        <div class="hortis-dataTable-scroll">
            <table>
                <thead @id="head"></thead>
                <tbody @id="body"></tbody>
            </table>
        </div>
        <div class="hortis-dataTable-pagination">
            <span class="hortis-dataTable-pageInfo">@{pageInfo}</span>
            <div class="hortis-dataTable-pageControls">
                <button data-move="start" disabled="@{window.atStart}">Start</button>
                <button data-move="prev" disabled="@{window.atStart}">← Prev</button>
                <button data-move="next" disabled="@{window.atEnd}">Next →</button>
                <button data-move="end" disabled="@{window.atEnd}">End</button>
            </div>
        </div>
    </div>
</template>

<symbols>
    <symbol id="imerss-i-sort-ascending" viewBox="0 0 22 22">
        <path d="M6.5625 15.5L11 6.63125L15.4375 15.5H6.5625Z" fill="currentColor"></path>
    </symbol>
    <symbol id="imerss-i-sort-descending" viewBox="0 0 22 22">
        <path d="M15.4375 7L11 15.8687L6.5625 7L15.4375 7Z" fill="currentColor"></path>
    </symbol>
    <symbol id="imerss-i-sortable" viewBox="0 0 22 22">
        <path d="M8.1875 9.5L10.9609 3.95703L13.7344 9.5H8.1875Z" fill="currentColor"></path>
        <path d="M13.7344 12.0781L10.9609 17.6211L8.1875 12.0781H13.7344Z" fill="currentColor"></path>
    </symbol>
</symbols>
