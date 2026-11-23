<script src="%accessible-autocomplete/dist/accessible-autocomplete.min.js" fluid-client data-fl-scope="global"></script>
<style src="%accessible-autocomplete/dist/accessible-autocomplete.min.css"></style>
<script>
"use strict";

// An accessible-autocomplete widget, rendered into a container of its own so that no template reconciles its markup
fluid.def("hortis.autocomplete", {
    $layers: "fluid.component",
    view: {
        $component: {
            $layers: "fluid.selfTemplateViewComponent"
        }
    },
    widget: {
        $bindable: {
            bind: "hortis.autocomplete.bind({self}, {autocompleteHost}, {self}.view.renderedContainer, {global}.accessibleAutocomplete)",
            onceOnly: true
        }
    }
});

/**
 * Answer the widget's query, offering no suggestions while its input hasn't the focus. A value written into the input
 * from outside, e.g. the name of a taxon chosen in the checklist by hortis.taxonSearchFilter.select, is picked up by the
 * widget's polling of its input as if typed, and would otherwise open its menu on the one suggestion matching it, which
 * stays open since the input is never left to close it.
 * @param {hortis.autocompleteHost} host - The component hosting the widget, which answers its queries
 * @param {HTMLElement} container - The container into which the widget is rendered
 * @param {String} query - The query
 * @param {Function} callback - The widget's callback, accepting the suggestions
 */
hortis.autocomplete.query = function (host, container, query, callback) {
    const input = container.querySelector("input");
    if (input && input.ownerDocument.activeElement === input) {
        host.queryAutocomplete(query, callback);
    } else {
        callback([]);
    }
};

hortis.autocomplete.bind = function (that, host, container, accessibleAutocomplete) {
    let togo;
    if (accessibleAutocomplete) {
        fluid.disableRendering(that);
        togo = accessibleAutocomplete({
            element: container,
            id: host.controlId,
            placeholder: host.placeholder,
            minLength: host.minLength,
            displayMenu: "overlay",
            confirmOnBlur: false,
            source: (query, callback) => hortis.autocomplete.query(host, container, query, callback),
            templates: {
                suggestion: fluid.getGlobalValue(host.renderSuggestion),
                inputValue: fluid.getGlobalValue(host.renderInputValue)
            },
            onConfirm: selection => host.confirmAutocomplete(selection)
        });
        container.querySelector("input")?.setAttribute("spellcheck", "false");
    } else {
        togo = fluid.unavailable({message: "The accessible-autocomplete library is not loaded", variety: "config"});
    }
    return togo;
};
</script>
