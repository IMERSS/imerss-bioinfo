"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

fluid.registerNamespace("hortis.dataTable");

// ── Markup generation ──

// TODO: find faster encoder
fluid.XMLEncode = function (text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
};

/**
 * Build the thead markup from column definitions and inject it.
 * @param {Object} that - The component instance
 * @param {Object[]} columns - Column information array
 */
hortis.dataTable.buildHead = function (that, columns) {
    const html = columns.map(col => {
        const cls = col.numeric ? ` class="hortis-dataTable-num"` : "";
        const style = col.width ? ` style="width:${col.width}"` : "";
        return `<th${cls}${style}>${fluid.XMLEncode(col.label)}</th>`;
    }).join("");
    const head = that.container[0].querySelector("thead");
    head.innerHTML = `<tr>${html}</tr>`;
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

/**
 * Render a single cell value for the given column definition and row.
 * @param {Object} col - Column definition from options.columns
 * @param {Object} row - The data row
 * @return {String} HTML string for the cell contents
 */
hortis.dataTable.renderCell = function (col, row) {
    const raw = row[col.key];
    if (typeof col.formatter === "function") {
        return col.formatter(raw, row);
    }
    return fluid.XMLEncode(String(raw ?? ""));
};

// ── Full render ──

/**
 * Render the current page of data rows and the pagination controls.
 * @param {Object} that - The component instance
 * @param {Object[]} rows - The current rows array
 * @param {Number} rowsPerPage - Rows that fit
 */
hortis.dataTable.render = function (that, rows, rowsPerPage) {

    // TODO: Get order/schematic information from that.options.columns
    const columns = Object.keys(rows[0]).map(key => ({key, label: key}));

    hortis.dataTable.buildHead(that, columns);

    const totalPages = hortis.dataTable.totalPages(rows.length, rowsPerPage);

    if (that.currentPage > totalPages) {
        that.currentPage = totalPages;
    }

    const start = (that.currentPage - 1) * rowsPerPage;
    const end = Math.min(start + rowsPerPage, rows.length);
    const slice = rows.slice(start, end);

    // Body rows
    const bodyHTML = slice.map(row =>
        `<tr>${columns.map(col => {
            const cls = col.numeric ? ` class="hortis-dataTable-num"` : "";
            return `<td${cls}>${hortis.dataTable.renderCell(col, row)}</td>`;
        }).join("")}</tr>`
    ).join("");
    that.dom.locate("tbody")[0].innerHTML = bodyHTML;

    // Page info
    const pageInfoEl = that.dom.locate("pageInfo");
    pageInfoEl.text(rows.length > 0
        ? `${start + 1}\u2013${end} of ${rows.length}  \u00b7  page ${that.currentPage}/${totalPages}`
        : "No data"
    );

    // Pagination controls
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
    hortis.dataTable.render(that, that.rows.value, hortis.dataTable.calcRowsPerPage(that));
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
 * Set up a preact-signals effect that re-renders whenever
 * `that.rows` or `that.resizeCount` change.
 * @param {Object} that - The component instance
 */
hortis.dataTable.bindEffect = function (that) {
    that.disposeEffect = fluid.effect((rows) => {
        const rowsPerPage = hortis.dataTable.calcRowsPerPage(that);
        hortis.dataTable.render(that, rows, rowsPerPage);
    }, that.rows, that.resizeCount);
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
    hortis.dataTable.bindEffect(that);
};

/**
 * onDestroy listener — disconnect the ResizeObserver and dispose the effect.
 * @param {Object} that - The component instance
 */
hortis.dataTable.onDestroy = function (that) {
    that.resizeObserver?.disconnect();
    that.disposeEffect?.();
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
