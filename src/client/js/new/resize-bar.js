"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

fluid.registerNamespace("hortis.resizeBar");

/**
 * Notes on assumptions on parent container sizing strategy:
 *
 * The correct approaches depend on what the surrounding layout is:
 *
 * If the panes are flex children, the right thing is to write to flex-grow / flex-basis rather than width, or to set
 * width as a percentage of the flex container minus the bar's width using calc. Alternatively, keep the panes as
 * flex: 1 and do the sizing via a CSS custom property or flex-basis that the bar updates.
 *
 * The cleanest fix given the current architecture is to drop the flex: none writes entirely
 * and instead set flex-basis in percentages while leaving flex-shrink: 1 and flex-grow: 0 in place
 * or simply let the parent use display: grid with a column template the component updates, which sidesteps the issue entirely.
 *
 * If the container is not a flex layout — e.g. the panes are positioned or the container is a grid
 * then flex: none is harmless but also pointless, and the percentages resolve correctly against the containing block.
 * In that case the fix is just to remove the flex: none writes and ensure the surrounding CSS isn't flex.
 *
 * In short: the flex: none writes should be removed. They were defensive coding against a layout assumption that is
 * in tension with percentage-based sizing, and they actively cause the overflow you are observing. The caller is
 * responsible for ensuring the container layout is compatible with explicit width/height percentages —
 * or the component should be documented to require a grid or non-flex container.
 */

// ── Size helpers ──────────────────────────────────────────────────────────────

/**
 * Return the rendered size of an element along the component's axis.
 * @param {Object} that - The component instance
 * @param {Element} el - The element to measure
 * @return {Number} Size in pixels
 */
hortis.resizeBar.sizeOf = function (that, el) {
    const rect = el.getBoundingClientRect();
    return that.isHorizontal ? rect.width : rect.height;
};

/**
 * Write new sizes back to the before/after elements as percentages of the
 * total span captured at drag start, and lock them out of flex.
 * Using percentages means the ratio is preserved if the parent is later resized.
 * @param {Object} that - The component instance
 * @param {Number} newBefore - New size for the before pane in pixels
 * @param {Number} newAfter - New size for the after pane in pixels
 */
hortis.resizeBar.applySize = function (that, newBefore, newAfter) {
    const before = that.options.before;
    const after  = that.options.after;
    const total  = that.dragState.startBefore + that.dragState.startAfter;
    const pctBefore = (newBefore / total * 100).toFixed(4) + "%";
    const pctAfter  = (newAfter  / total * 100).toFixed(4) + "%";
    if (that.isHorizontal) {
        before.style.width = pctBefore;
        after.style.width  = pctAfter;
    } else {
        before.style.height = pctBefore;
        after.style.height  = pctAfter;
    }
};

/**
 * Clamp rawBefore to [minBefore, total - minAfter] then apply.
 * Clamping is done in pixels against the snapshot taken at drag start so that
 * minBefore/minAfter remain meaningful regardless of parent size.
 * @param {Object} that - The component instance
 * @param {Number} rawBefore - Unclamped candidate size for the before pane in pixels
 */
hortis.resizeBar.clampAndApply = function (that, rawBefore) {
    const { minBefore, minAfter } = that.options;
    const total = that.dragState.startBefore + that.dragState.startAfter;
    const nb = Math.min(Math.max(rawBefore, minBefore), total - minAfter);
    hortis.resizeBar.applySize(that, nb, total - nb);
};

// ── Bar construction ──────────────────────────────────────────────────────────

/**
 * Build the bar element, set its classes and ARIA attributes, and insert it
 * into the DOM immediately before the after pane.
 * @param {Object} that - The component instance
 */
hortis.resizeBar.buildBar = function (that) {
    const bar = document.createElement("div");
    bar.className = [
        "resize-bar",
        that.isHorizontal ? "resize-bar--horizontal" : "resize-bar--vertical",
        that.options.barClass
    ].filter(Boolean).join(" ");

    bar.setAttribute("role", "separator");
    bar.setAttribute("aria-orientation", that.isHorizontal ? "vertical" : "horizontal");
    bar.setAttribute("tabindex", "0");
    bar.setAttribute("aria-label", "Resize panels");

    that.options.after.insertAdjacentElement("beforebegin", bar);
    that.bar = bar;
};

// ── Pointer events ────────────────────────────────────────────────────────────

/**
 * Handle pointerdown: snapshot pixel sizes (used throughout the drag for
 * clamping and percentage conversion), capture the pointer, enter active state.
 * @param {Object} that - The component instance
 * @param {PointerEvent} e - The pointer event
 */
hortis.resizeBar.onPointerDown = function (that, e) {
    if (e.button !== 0) {
        return;
    }
    that.dragState.active      = true;
    that.dragState.startPos    = that.isHorizontal ? e.clientX : e.clientY;
    that.dragState.startBefore = hortis.resizeBar.sizeOf(that, that.options.before);
    that.dragState.startAfter  = hortis.resizeBar.sizeOf(that, that.options.after);

    that.bar.setPointerCapture(e.pointerId);
    that.bar.classList.add("resize-bar--active");
    document.body.style.cursor     = that.isHorizontal ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";

    e.preventDefault();
};

/**
 * Handle pointermove: compute pixel delta from drag origin and apply clamped size.
 * @param {Object} that - The component instance
 * @param {PointerEvent} e - The pointer event
 */
hortis.resizeBar.onPointerMove = function (that, e) {
    if (that.dragState.active) {
        const pos = that.isHorizontal ? e.clientX : e.clientY;
        hortis.resizeBar.clampAndApply(that, that.dragState.startBefore + (pos - that.dragState.startPos));
    }
};

/**
 * Handle pointerup / pointercancel: leave active state and restore body styles.
 * @param {Object} that - The component instance
 */
hortis.resizeBar.onPointerUp = function (that) {
    if (that.dragState.active) {
        that.dragState.active = false;
        that.bar.classList.remove("resize-bar--active");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
    }
};

// ── Hover ─────────────────────────────────────────────────────────────────────

/**
 * Add the hover class on mouseenter.
 * @param {Object} that - The component instance
 */
hortis.resizeBar.onMouseEnter = function (that) {
    that.bar.classList.add("resize-bar--hover");
};

/**
 * Remove the hover class on mouseleave.
 * @param {Object} that - The component instance
 */
hortis.resizeBar.onMouseLeave = function (that) {
    that.bar.classList.remove("resize-bar--hover");
};

// ── Keyboard ──────────────────────────────────────────────────────────────────

/**
 * Arrow keys nudge the split by 16 px (4 px with Shift).
 * Nudge amounts are specified in pixels then converted to a percentage of the
 * current total span, so a nudge always feels the same size to the user.
 * @param {Object} that - The component instance
 * @param {KeyboardEvent} e - Keydown event
 */
hortis.resizeBar.onKeyDown = function (that, e) {
    const shrink = that.isHorizontal ? "ArrowLeft"  : "ArrowUp";
    const grow   = that.isHorizontal ? "ArrowRight" : "ArrowDown";
    if (e.key === shrink || e.key === grow) {
        e.preventDefault();

        const step = e.shiftKey ? 4 : 16;
        const delta = e.key === grow ? step : -step;

        // Re-snapshot current rendered sizes so the nudge is relative to reality,
        // not to a stale drag origin.
        that.dragState.startBefore = hortis.resizeBar.sizeOf(that, that.options.before);
        that.dragState.startAfter = hortis.resizeBar.sizeOf(that, that.options.after);
        hortis.resizeBar.clampAndApply(that, that.dragState.startBefore + delta);
    }
};

// ── Event wiring ──────────────────────────────────────────────────────────────

/**
 * Attach all DOM event listeners to the bar element.
 * Bound handlers are stored on `that.listeners` so onDestroy can remove them.
 * @param {Object} that - The component instance
 */
hortis.resizeBar.bindListeners = function (that) {
    that.listeners = {
        pointerdown:   function (e) { hortis.resizeBar.onPointerDown(that, e); },
        pointermove:   function (e) { hortis.resizeBar.onPointerMove(that, e); },
        pointerup:     function ()  { hortis.resizeBar.onPointerUp(that); },
        pointercancel: function ()  { hortis.resizeBar.onPointerUp(that); },
        mouseenter:    function ()  { hortis.resizeBar.onMouseEnter(that); },
        mouseleave:    function ()  { hortis.resizeBar.onMouseLeave(that); },
        keydown:       function (e) { hortis.resizeBar.onKeyDown(that, e); }
    };
    Object.entries(that.listeners).forEach(function ([event, handler]) {
        that.bar.addEventListener(event, handler);
    });
};

/**
 * Remove all DOM event listeners and detach the bar element from the DOM.
 * @param {Object} that - The component instance
 */
hortis.resizeBar.unbindListeners = function (that) {
    Object.entries(that.listeners).forEach(function ([event, handler]) {
        that.bar.removeEventListener(event, handler);
    });
    that.bar.remove();
};

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * onCreate: derive isHorizontal, build the bar, and wire up events.
 * @param {Object} that - The component instance
 */
hortis.resizeBar.onCreate = function (that) {
    that.isHorizontal = that.options.axis === "horizontal";
    hortis.resizeBar.buildBar(that);
    hortis.resizeBar.bindListeners(that);
};

/**
 * onDestroy: remove listeners and pull the bar out of the DOM.
 * @param {Object} that - The component instance
 */
hortis.resizeBar.onDestroy = function (that) {
    hortis.resizeBar.unbindListeners(that);
};

// ── Component registration ────────────────────────────────────────────────────

fluid.defaults("hortis.resizeBar", {
    gradeNames: ["fluid.component"],

    // Required — caller must supply the before element; after defaults to its
    // next sibling, which is where the bar will be inserted.
    before: null,  // {Element} The DOM element before the bar
    after:  "{that}.options.before.nextElementSibling",  // {Element} The DOM element after the bar

    axis:      "horizontal", // "horizontal" | "vertical"
    minBefore: 48,           // Minimum px size of the before pane
    minAfter:  48,           // Minimum px size of the after pane
    barClass:  "",           // Extra CSS class(es) for the bar element

    members: {
        bar:          null,  // {Element}  Set by buildBar
        listeners:    null,  // {Object}   Bound handler refs, set by bindListeners
        isHorizontal: null,  // {Boolean}  Derived from options.axis in onCreate
        dragState: {
            active:      false,
            startPos:    0,
            startBefore: 0,  // px — snapshotted at drag/nudge start
            startAfter:  0   // px — snapshotted at drag/nudge start
        }
    },

    listeners: {
        "onCreate.init": {
            funcName: "hortis.resizeBar.onCreate",
            args:     ["{that}"]
        },
        "onDestroy.cleanup": {
            funcName: "hortis.resizeBar.onDestroy",
            args:     ["{that}"]
        }
    }
});
