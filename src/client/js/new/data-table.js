"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

fluid.registerNamespace("hortis.dataTable");

// ── Markup generation ──

// TODO: find faster encoder
fluid.XMLEncode = function (text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
};

// ── Sort helpers ──

/**
 * Return an SVG <use> element string for the given symbol id.
 * @param {String} id - The symbol id to reference
 * @return {String} - SVG markup string
 */
hortis.dataTable.svgIcon = function (id) {
    return `<svg class="hortis-dataTable-icon"><use href="#${id}"/></svg>`;
};

/**
 * Return the sort icon symbol id for a column given current sort state.
 * @param {String} key - The column key
 * @param {String|null} sortColumn - The currently sorted column key
 * @param {Number} sortDirection - 1 for ascending, -1 for descending
 * @return {String} - Symbol id string
 */
hortis.dataTable.sortIconId = function (key, sortColumn, sortDirection) {
    if (key !== sortColumn) {
        return "sortable";
    } else if (sortDirection === 1) {
        return "sort-ascending";
    } else {
        return "sort-descending";
    }
};

/**
 * Sort a rows array by the given column key and direction.
 * @param {Object[]} rows - The rows to sort
 * @param {String} key - The column key to sort by
 * @param {Number} direction - 1 for ascending, -1 for descending
 * @return {Object[]} - A new sorted array
 */
hortis.dataTable.sortRows = function (rows, key, direction) {
    return rows.slice().sort(function (a, b) {
        const av = a[key] ?? "";
        const bv = b[key] ?? "";
        if (av < bv) {
            return -direction;
        } else if (av > bv) {
            return direction;
        } else {
            return 0;
        }
    });
};


/**
 * @callback FormatterCallback
 * @param {any} value - The cell value.
 * @param {Object} row - The row data object.
 * @return {String} - The formatted cell string.
 */

/**
 * @typedef {Object} ColumnInfo
 * @property {String} key - The property name in the data row for this column.
 * @property {String} label - The column header label.
 * @property {Boolean} [numeric] - Whether the column is numeric (optional).
 * @property {String} [width] - CSS width for the column (optional).
 * @property {FormatterCallback} [formatter] - Custom cell formatter function (optional).
 */

/**
 * Build the thead markup from column definitions, injecting sort controls
 * when the table is sortable.
 * @param {Object} that - The component instance
 * @param {ColumnInfo[]} columns - Column information array
 * @param {String|null} sortColumn - The currently sorted column key
 * @param {Number} sortDirection - 1 ascending, -1 descending
 */
hortis.dataTable.buildHead = function (that, columns, sortColumn, sortDirection) {
    const html = columns.map(function (col) {
        const cls = col.numeric ? ` class="hortis-dataTable-num"` : "";
        const style = col.width ? ` style="width:${col.width}"` : "";
        const icon = that.options.sortable
            ? `<button class="hortis-dataTable-sort" data-key="${fluid.XMLEncode(col.key)}" aria-label="Sort by ${fluid.XMLEncode(col.label)}">${hortis.dataTable.svgIcon(hortis.dataTable.sortIconId(col.key, sortColumn, sortDirection))}</button>`
            : "";
        return `<th${cls}${style}><div class="hortis-dataTable-sort-wrap">${fluid.XMLEncode(col.label)}${icon}</div></th>`;
    }).join("");
    const head = that.container[0].querySelector("thead");
    head.innerHTML = `<tr>${html}</tr>`;
    if (that.options.sortable) {
        hortis.dataTable.bindSortEvents(that);
    }
};

// ── Row-height measurement ──

/**
 * Measure the natural rendered height of a single table row.
 * Called once at init; the result is cached on `that.cachedRowHeight`.
 * @param {Object} that - The component instance
 * @return {Number} Row height in pixels
 */
hortis.dataTable.measureRowHeight = function (that) {
    const tbody = that.dom.locate("tbody")[0];
    const tr = document.createElement("tr");
    tr.innerHTML = "<td>MgMg</td>";
    tbody.appendChild(tr);
    const h = tr.getBoundingClientRect().height;
    tbody.removeChild(tr);
    return h;
};

// ── Scroll arithmetic ──

/**
 * Return the height in pixels of a body row, which all rows are assumed to share since their cells do not wrap.
 * @param {Object} that - The component instance
 * @return {Number} Row height in pixels
 */
hortis.dataTable.rowHeight = function (that) {
    if (!that.cachedRowHeight) {
        that.cachedRowHeight = hortis.dataTable.measureRowHeight(that);
    }
    return that.cachedRowHeight || 37;
};

/**
 * Compute the part of the scrolling area which is not covered by the sticky header, and the rows which show within it.
 * @param {Object} that - The component instance
 * @return {Object} The extent, with Numbers `rowHeight`, `rowsPerView` for the rows that completely fit, `first` for
 *     the index of the topmost row completely showing and `end` for the index after the bottommost one, and Booleans
 *     `atStart` and `atEnd` for whether the area is scrolled to its limits
 */
hortis.dataTable.viewExtent = function (that) {
    const scrollEl = that.dom.locate("scrollEl")[0];
    const total = that.displayRows.length;
    const rowHeight = hortis.dataTable.rowHeight(that);
    const theadH = scrollEl.querySelector("thead")?.getBoundingClientRect().height ?? 38;
    const available = scrollEl.clientHeight - theadH;
    const scrollTop = scrollEl.scrollTop;
    // Allow for the browser's rounding of scrollTop, and count just the rows which completely show
    const atEnd = scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1;
    const first = Math.min(Math.ceil((scrollTop - 1) / rowHeight), Math.max(total - 1, 0));
    return {
        rowHeight,
        rowsPerView: Math.max(Math.floor(available / rowHeight), 1),
        first,
        end: atEnd ? total : Math.min(Math.floor((scrollTop + available + 1) / rowHeight), total),
        atStart: scrollTop <= 0,
        atEnd
    };
};

// ── Cell rendering ──

hortis.dataTable.defaultFormatter = function (value) {
    if (typeof(value) === "string") {
        const encoded = fluid.XMLEncode(value);
        return (encoded.startsWith("http://") || encoded.startsWith("https://")) ?
            `<a href="${encoded}" target="_blank">${encoded}</a>` : encoded;
    } else {
        return value;
    }
};

/**
 * Render a single cell value for the given column definition and row.
 * @param {ColumnInfo} col - Column definition from options.columns
 * @param {Object} row - The data row
 * @return {String} HTML string for the cell contents
 */
hortis.dataTable.renderCell = function (col, row) {
    const raw = row[col.key];
    if (typeof col.formatter === "function") {
        return col.formatter(raw, row);
    } else {
        return hortis.dataTable.defaultFormatter(String(raw ?? ""));
    }
};

hortis.dataTable.defaultColumns = function (rows, staticColumns) {
    if (staticColumns && staticColumns.length > 0) {
        return staticColumns;
    } else {
        const firstRow = rows[0];
        return firstRow ? Object.keys(firstRow).map(key => ({key, label: key})) : [];
    }
};

// ── Full render ──

/**
 * Render everything derived from the rows and columns, applying sort and selection when enabled, retaining the
 * current scroll position.
 * @param {Object} that - The component instance
 * @param {Object[]} rows - The current rows array
 * @param {ColumnInfo[]} columns - Column formatting information
 */
hortis.dataTable.render = function (that, rows, columns) {
    const sortColumn = that.sortColumn.value,
        sortDirection = that.sortDirection.value;
    that.displayRows = sortColumn ? hortis.dataTable.sortRows(rows, sortColumn, sortDirection) : rows;
    that.displayColumns = columns;
    if (rows !== that.lastRows) {
        that.lastRows = rows;
        that.columnWidths = [];
    }

    hortis.dataTable.buildHead(that, columns, sortColumn, sortDirection);

    const head = that.container[0].querySelector("thead tr");
    if (that.options.rowSelectable && head && !head.querySelector(".hortis-dataTable-select-cell")) {
        head.insertAdjacentHTML("afterbegin", `<th class="hortis-dataTable-select-cell"></th>`);
    }
    hortis.dataTable.updateHeadHeight(that);

    hortis.dataTable.renderRows(that, true);
    // Correct the first estimate of the row height from real rows now that we have some, which also repositions them
    if (hortis.dataTable.correctRowHeight(that)) {
        hortis.dataTable.renderRows(that, true);
    }
};

/**
 * Publish the height of the table header to CSS so that it can confine the vertical scrollbar to the table body.
 * @param {Object} that - The component instance
 */
hortis.dataTable.updateHeadHeight = function (that) {
    const scrollEl = that.dom.locate("scrollEl")[0];
    const height = scrollEl.querySelector("thead").getBoundingClientRect().height;
    scrollEl.style.setProperty("--data-table-head-height", height + "px");
};

/**
 * Update the cached row height from the rows that have been rendered, which may differ from our test row.
 * @param {Object} that - The component instance
 * @return {Boolean} `true` if the cached row height was changed
 */
hortis.dataTable.correctRowHeight = function (that) {
    const trs = that.dom.locate("tbody")[0].querySelectorAll("tr:not(.hortis-dataTable-spacer)");
    let changed = false;
    if (trs.length > 1) {
        // Measure between the tops of rows since the final row in the table has no border
        const measured = (trs[trs.length - 1].getBoundingClientRect().top - trs[0].getBoundingClientRect().top) / (trs.length - 1);
        if (measured > 0 && Math.abs(measured - that.cachedRowHeight) > 0.001) {
            that.cachedRowHeight = measured;
            changed = true;
        }
    }
    return changed;
};

/**
 * Render a spacer row standing in for a run of rows which are not currently in the DOM.
 * @param {Number} height - The height of the spacer in pixels
 * @param {Number} columnCount - The number of columns in the table
 * @return {String} - HTML string for the spacer, which is empty if there are no rows to stand in for
 */
hortis.dataTable.renderSpacer = function (height, columnCount) {
    return height > 0 ? `<tr class="hortis-dataTable-spacer" style="height:${height}px"><td colspan="${columnCount}"></td></tr>` : "";
};

/**
 * Render the rows around the current scroll position into the tbody, with spacers standing in for the others so that
 * the scrollbar represents all of them, and update the display of the position.
 * @param {Object} that - The component instance
 * @param {Boolean} [force] - `true` if the rows must be rendered even if the same ones are already showing
 */
hortis.dataTable.renderRows = function (that, force) {
    const rows = that.displayRows,
        columns = that.displayColumns,
        selectedRow = that.selectedRow.value,
        total = rows.length;
    const extent = hortis.dataTable.viewExtent(that);

    // Rows are rendered in blocks either side of the view so that most scroll events have nothing to render
    const blockSize = Math.max(extent.rowsPerView, that.options.minBlockSize);
    const block = Math.floor(extent.first / blockSize);
    const start = Math.max(block - 1, 0) * blockSize;
    const end = Math.min((block + 3) * blockSize, total);

    if (force || start !== that.renderedStart || end !== that.renderedEnd) {
        that.renderedStart = start;
        that.renderedEnd = end;
        const slice = rows.slice(start, end);
        const columnCount = columns.length + (that.options.rowSelectable ? 1 : 0);

        const bodyHTML = slice.map(function (row) {
            const checkCell = that.options.rowSelectable ? hortis.dataTable.renderCheckboxCell(row, selectedRow) : "";
            const cells = columns.map(function (col) {
                const cls = col.numeric ? ` class="hortis-dataTable-num"` : "";
                return `<td${cls}>${hortis.dataTable.renderCell(col, row)}</td>`;
            }).join("");
            const selectedCls = row === selectedRow ? ` class="hortis-dataTable-selected-row"` : "";
            return `<tr${selectedCls}>${checkCell}${cells}</tr>`;
        }).join("");

        that.dom.locate("tbody")[0].innerHTML = hortis.dataTable.renderSpacer(start * extent.rowHeight, columnCount)
            + bodyHTML
            + hortis.dataTable.renderSpacer((total - end) * extent.rowHeight, columnCount);

        if (that.options.rowSelectable) {
            hortis.dataTable.bindRowSelectEvents(that, slice);
        }
        hortis.dataTable.holdColumnWidths(that);
    }
    hortis.dataTable.updatePosition(that);
};

/**
 * Stop columns jumping around as different rows are rendered during scrolling, by not letting any of them shrink. This
 * is forgotten when the rows change.
 * @param {Object} that - The component instance
 */
hortis.dataTable.holdColumnWidths = function (that) {
    const wraps = that.container[0].querySelectorAll("thead .hortis-dataTable-sort-wrap");
    wraps.forEach(function (wrap, i) {
        const width = Math.max(that.columnWidths[i] || 0, wrap.getBoundingClientRect().width);
        that.columnWidths[i] = width;
        wrap.style.minWidth = width + "px";
    });
};

/**
 * Update the display of which rows are showing, and which navigation controls are available, from the scroll position.
 * @param {Object} that - The component instance
 */
hortis.dataTable.updatePosition = function (that) {
    const total = that.displayRows.length;
    const extent = hortis.dataTable.viewExtent(that);
    that.dom.locate("pageInfo").text(total > 0 ? `${extent.first + 1}\u2013${extent.end} of ${total}` : "No data");
    const controls = that.dom.locate("pageControls")[0];
    controls.querySelectorAll("[data-move=start], [data-move=prev]").forEach(button => button.disabled = extent.atStart);
    controls.querySelectorAll("[data-move=next], [data-move=end]").forEach(button => button.disabled = extent.atEnd);
};

// ── Navigation ──

/**
 * Move the scroll position in response to one of the navigation controls. "prev" and "next" move by the rows that
 * completely fit in the view.
 * @param {Object} that - The component instance
 * @param {String} move - The move to make, one of "start", "prev", "next" or "end"
 */
hortis.dataTable.navigate = function (that, move) {
    const scrollEl = that.dom.locate("scrollEl")[0];
    const extent = hortis.dataTable.viewExtent(that);
    const targets = {
        start: 0,
        prev: (extent.first - extent.rowsPerView) * extent.rowHeight,
        next: (extent.first + extent.rowsPerView) * extent.rowHeight,
        end: scrollEl.scrollHeight
    };
    scrollEl.scrollTop = targets[move];
    // No need to wait for scrolling to come to rest since this was a single move
    hortis.dataTable.renderRows(that);
};

/**
 * Render the navigation controls, which last for the lifetime of the component, and attach their click listener.
 * @param {Object} that - The component instance
 */
hortis.dataTable.bindNavigation = function (that) {
    const controlsEl = that.dom.locate("pageControls")[0];
    controlsEl.innerHTML = `<button data-move="start">Start</button>`
        + `<button data-move="prev">\u2190 Prev</button>`
        + `<button data-move="next">Next \u2192</button>`
        + `<button data-move="end">End</button>`;
    controlsEl.addEventListener("click", function (e) {
        const move = e.target.dataset.move;
        if (move) {
            hortis.dataTable.navigate(that, move);
        }
    });
};

/**
 * Follow the scroll position - the display of the position is updated at most once per animation frame, whereas the
 * rows are only rendered once scrolling comes to rest so that this doesn't hold up dragging the scrollbar.
 * @param {Object} that - The component instance
 */
hortis.dataTable.bindScroll = function (that) {
    that.dom.locate("scrollEl")[0].addEventListener("scroll", function () {
        if (!that.scrollFrame) {
            that.scrollFrame = requestAnimationFrame(function () {
                that.scrollFrame = null;
                hortis.dataTable.updatePosition(that);
            });
        }
        clearTimeout(that.scrollTimer);
        that.scrollTimer = setTimeout(function () {
            hortis.dataTable.renderRows(that);
        }, that.options.scrollRestDelay);
    });
};

/**
 * Attach click listeners to sort buttons in the thead.
 * Toggles direction when the same column is clicked again.
 * @param {Object} that - The component instance
 */
hortis.dataTable.bindSortEvents = function (that) {
    const head = that.container[0].querySelector("thead");
    for (const btn of head.querySelectorAll(".hortis-dataTable-sort")) {
        btn.addEventListener("click", function () {
            const key = btn.dataset.key;
            if (that.sortColumn.value === key) {
                that.sortDirection.value = that.sortDirection.value * -1;
            } else {
                that.sortColumn.value = key;
                that.sortDirection.value = 1;
            }
        });
    }
};

// ── Row selection ──

/**
 * Render a checkbox cell for row selection.
 * @param {Object} row - The row data object
 * @param {Object|null} selectedRow - The currently selected row, or null
 * @return {String} - HTML string for the checkbox cell
 */
hortis.dataTable.renderCheckboxCell = function (row, selectedRow) {
    const checked = row === selectedRow ? " checked" : "";
    return `<td class="hortis-dataTable-select-cell"><input type="checkbox" class="hortis-dataTable-row-check"${checked}/></td>`;
};

/**
 * Attach click listeners to row checkboxes in the tbody.
 * Sets selectedRow signal; clicking an already-selected row deselects it.
 * @param {Object} that - The component instance
 * @param {Object[]} slice - The currently rendered row slice
 */
hortis.dataTable.bindRowSelectEvents = function (that, slice) {
    const tbody = that.dom.locate("tbody")[0];
    const checkboxes = tbody.querySelectorAll(".hortis-dataTable-row-check");
    checkboxes.forEach(function (checkbox, i) {
        checkbox.addEventListener("change", function () {
            if (checkbox.checked) {
                that.selectedRow.value = slice[i];
            } else {
                that.selectedRow.value = null;
            }
        });
    });
};

// ── Resize handling ──

/**
 * Attach a ResizeObserver to the scroll element. On resize, increment
 * the resizeCount signal to trigger the reactive effect.
 * @param {Object} that - The component instance
 */
hortis.dataTable.bindResize = function (that) {
    that.resizeObserver = new ResizeObserver(() => {
        that.resizeCount.value = that.resizeCount.peek() + 1;
    });
    that.resizeObserver.observe(that.dom.locate("scrollEl")[0]);
};

// ── Reactive effect ──

/**
 * Set up a preact-signals effect that re-renders whenever rows, columns,
 * sort state, selection, or resize change.
 * @param {Object} that - The component instance
 */
hortis.dataTable.bindRenderEffect = function (that) {
    that.disposeRenderEffect = fluid.effect(function (rows, columns) {
        hortis.dataTable.render(that, rows, columns);
    }, that.rows, that.columns, that.sortColumn, that.sortDirection, that.selectedRow, that.resizeCount);
};

// ── Lifecycle ──

/**
 * onCreate listener — render the navigation controls, wire up the scroll
 * listener and ResizeObserver, and start the reactive effect.
 * @param {Object} that - The component instance
 */
hortis.dataTable.onCreate = function (that) {
    hortis.dataTable.bindNavigation(that);
    hortis.dataTable.bindScroll(that);
    hortis.dataTable.bindResize(that);
    hortis.dataTable.bindRenderEffect(that);
};

/**
 * onDestroy listener — disconnect the ResizeObserver, dispose the effect and cancel any pending scroll update.
 * @param {Object} that - The component instance
 */
hortis.dataTable.onDestroy = function (that) {
    that.resizeObserver?.disconnect();
    that.disposeRenderEffect?.();
    if (that.scrollFrame) {
        cancelAnimationFrame(that.scrollFrame);
    }
    clearTimeout(that.scrollTimer);
};

hortis.dataTable.markup = `
  <div class="hortis-dataTable-wrap">
    <div class="hortis-dataTable-scroll">
      <table>
        <thead></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="hortis-dataTable-pagination">
      <span class="hortis-dataTable-pageInfo"></span>
      <div class="hortis-dataTable-pageControls"></div>
    </div>
  </div>
`;

// ══════════════════════════════════════════════════════════════════════════════
// fluid.defaults — component registration
// ══════════════════════════════════════════════════════════════════════════════

fluid.defaults("hortis.dataTable", {
    gradeNames: ["fluid.viewComponent", "fluid.containerRenderingView"],

    markup: {
        container: hortis.dataTable.markup
    },

    members: {
        rows: "@expand:signal()",
        columns: "@expand:fluid.computed(hortis.dataTable.defaultColumns, {that}.rows, {that}.options.columns)",
        selectedRow: "@expand:signal(null)",
        sortColumn: "@expand:signal(null)",
        sortDirection: "@expand:signal(1)",
        resizeCount: "@expand:signal(0)",
        cachedRowHeight: 0,
        displayRows: [], // The rows in their displayed order
        displayColumns: [],
        lastRows: null,
        columnWidths: [],
        renderedStart: 0,
        renderedEnd: 0,
        scrollFrame: null,
        scrollTimer: null
    },

    selectors: {
        scrollEl: ".hortis-dataTable-scroll",
        tbody: "tbody",
        pageInfo: ".hortis-dataTable-pageInfo",
        pageControls: ".hortis-dataTable-pageControls"
    },

    columns: [],
    minBlockSize: 20, // Minimum number of rows rendered at a time, more are needed for a large view
    scrollRestDelay: 100, // Time in ms without a scroll event after which scrolling is considered to have come to rest
    sortable: false,
    rowSelectable: false,

    listeners: {
        "onCreate.init": {
            funcName: "hortis.dataTable.onCreate",
            args: ["{that}"]
        },
        "onDestroy.cleanup": {
            funcName: "hortis.dataTable.onDestroy",
            args: ["{that}"]
        }
    }
});
