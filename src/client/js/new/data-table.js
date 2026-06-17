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
 * @param {Any} value - The cell value.
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

// ── Pagination arithmetic ──

/**
 * Calculate how many body rows fit in the available scroll area.
 * @param {Object} that - The component instance
 * @return {Number} Number of body rows
 */
hortis.dataTable.calcRowsPerPage = function (that) {
    const scrollEl = that.dom.locate("scrollEl")[0];
    const thead = scrollEl.querySelector("thead");
    const theadH = thead?.getBoundingClientRect().height ?? 38;
    const available = scrollEl.clientHeight - theadH;

    if (!that.cachedRowHeight) {
        that.cachedRowHeight = hortis.dataTable.measureRowHeight(that);
    }

    return Math.max(Math.floor(available / (that.cachedRowHeight || 37)), 1);
};

/**
 * Return the total number of pages.
 * @param {Number} rowCount - Total rows
 * @param {Number} rowsPerPage - Rows per page
 * @return {Number} Total number of pages
 */
hortis.dataTable.totalPages = function (rowCount, rowsPerPage) {
    return Math.ceil(rowCount / rowsPerPage) || 1;
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
 * Render the current page of data rows and the pagination controls,
 * applying sort and selection when enabled.
 * @param {Object} that - The component instance
 * @param {Object[]} rows - The current rows array
 * @param {ColumnInfo[]} columns - Column formatting information
 * @param {Number} rowsPerPage - Number of rows that fit
 */
hortis.dataTable.render = function (that, rows, columns, rowsPerPage) {
    const sortColumn = that.sortColumn.value,
        sortDirection = that.sortDirection.value,
        selectedRow = that.selectedRow.value;
    const displayRows = sortColumn ? hortis.dataTable.sortRows(rows, sortColumn, sortDirection) : rows;

    hortis.dataTable.buildHead(that, columns, sortColumn, sortDirection);

    const totalPages = hortis.dataTable.totalPages(displayRows.length, rowsPerPage);

    if (that.currentPage > totalPages) {
        that.currentPage = totalPages;
    }

    const start = (that.currentPage - 1) * rowsPerPage;
    const end = Math.min(start + rowsPerPage, displayRows.length);
    const slice = displayRows.slice(start, end);

    const selectCol = that.options.rowSelectable
        ? `<th class="hortis-dataTable-select-cell"></th>`
        : "";

    const bodyHTML = slice.map(function (row) {
        const checkCell = that.options.rowSelectable ? hortis.dataTable.renderCheckboxCell(row, selectedRow) : "";
        const cells = columns.map(function (col) {
            const cls = col.numeric ? ` class="hortis-dataTable-num"` : "";
            return `<td${cls}>${hortis.dataTable.renderCell(col, row)}</td>`;
        }).join("");
        const selectedCls = row === selectedRow ? ` class="hortis-dataTable-selected-row"` : "";
        return `<tr${selectedCls}>${checkCell}${cells}</tr>`;
    }).join("");

    const head = that.container[0].querySelector("thead tr");
    if (that.options.rowSelectable && head && !head.querySelector(".hortis-dataTable-select-cell")) {
        head.insertAdjacentHTML("afterbegin", selectCol);
    }

    that.dom.locate("tbody")[0].innerHTML = bodyHTML;

    if (that.options.rowSelectable) {
        hortis.dataTable.bindRowSelectEvents(that, slice);
    }

    const pageInfoEl = that.dom.locate("pageInfo");
    pageInfoEl.text(displayRows.length > 0
        ? `${start + 1}\u2013${end} of ${displayRows.length}  \u00b7  page ${that.currentPage}/${totalPages}`
        : "No data"
    );

    hortis.dataTable.renderPagination(that, totalPages);
};

/**
 * Render the pagination button strip and attach click handlers.
 * @param {Object} that - The component instance
 * @param {Number} totalPages - Total number of pages to render
 */
hortis.dataTable.renderPagination = function (that, totalPages) {
    const { pageWindowSize } = that.options;
    let pStart = Math.max(1, that.currentPage - Math.floor(pageWindowSize / 2));
    let pEnd = Math.min(totalPages, pStart + pageWindowSize - 1);
    if (pEnd - pStart < pageWindowSize - 1) {
        pStart = Math.max(1, pEnd - pageWindowSize + 1);
    }

    const prevDisabled = that.currentPage <= 1 ? " disabled" : "";
    const nextDisabled = that.currentPage >= totalPages ? " disabled" : "";

    const pageButtons = Array.from({ length: pEnd - pStart + 1 }, (_, i) => {
        const p = pStart + i;
        const active = p === that.currentPage ? " hortis-dataTable-active" : "";
        return `<button class="hortis-dataTable-pg${active}" data-page="${p}">${p}</button>`;
    }).join("");

    that.dom.locate("pageControls").html(
        `<button class="hortis-dataTable-prev"${prevDisabled}>\u2190 Prev</button>`
        + pageButtons
        + `<button class="hortis-dataTable-next"${nextDisabled}>Next \u2192</button>`
    );

    hortis.dataTable.bindPaginationEvents(that, totalPages);
};

/**
 * Trigger a render using the current signal values. Used by pagination clicks.
 * @param {Object} that - The component instance
 */
hortis.dataTable.rerender = function (that) {
    hortis.dataTable.render(that, that.rows.value, that.columns.value, hortis.dataTable.calcRowsPerPage(that));
};

/**
 * Attach click listeners to the rendered pagination buttons.
 * @param {Object} that - The component instance
 * @param {Number} totalPages - Total number of pages rendered
 */
hortis.dataTable.bindPaginationEvents = function (that, totalPages) {
    const controlsEl = that.dom.locate("pageControls")[0];

    controlsEl.querySelector(".hortis-dataTable-prev").addEventListener("click", () => {
        if (that.currentPage > 1) {
            that.currentPage--;
            hortis.dataTable.rerender(that);
        }
    });

    controlsEl.querySelector(".hortis-dataTable-next").addEventListener("click", () => {
        if (that.currentPage < totalPages) {
            that.currentPage++;
            hortis.dataTable.rerender(that);
        }
    });

    for (const btn of controlsEl.querySelectorAll(".hortis-dataTable-pg")) {
        btn.addEventListener("click", () => {
            that.currentPage = parseInt(btn.dataset.page, 10);
            hortis.dataTable.rerender(that);
        });
    }
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
        const rowsPerPage = hortis.dataTable.calcRowsPerPage(that);
        hortis.dataTable.render(that, rows, columns, rowsPerPage);
    }, that.rows, that.columns, that.sortColumn, that.sortDirection, that.selectedRow, that.resizeCount);
};

// ── Lifecycle ──

/**
 * onCreate listener — build the head, measure row height,
 * wire up the ResizeObserver, and start the reactive effect.
 * @param {Object} that - The component instance
 */
hortis.dataTable.onCreate = function (that) {
    that.currentPage = 1;

    hortis.dataTable.bindResize(that);
    hortis.dataTable.bindRenderEffect(that);
};

/**
 * onDestroy listener — disconnect the ResizeObserver and dispose the effect.
 * @param {Object} that - The component instance
 */
hortis.dataTable.onDestroy = function (that) {
    that.resizeObserver?.disconnect();
    that.disposeRenderEffect?.();
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
        currentPage: 1,
        cachedRowHeight: 0
    },

    selectors: {
        scrollEl: ".hortis-dataTable-scroll",
        tbody: "tbody",
        pageInfo: ".hortis-dataTable-pageInfo",
        pageControls: ".hortis-dataTable-pageControls"
    },

    columns: [],
    pageWindowSize: 5,
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
