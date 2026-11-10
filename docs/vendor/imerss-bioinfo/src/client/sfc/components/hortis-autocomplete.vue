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
            source: (query, callback) => host.queryAutocomplete(query, callback),
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
