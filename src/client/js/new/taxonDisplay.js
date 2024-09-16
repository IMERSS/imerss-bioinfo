
"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var hortis = fluid.registerNamespace("hortis");

hortis.taxonDisplayLookup = {
    iNaturalistTaxonName: "Taxon Name:",
    observationCount: "Observation Count:",
    iNaturalistObsLink: "Observation:",
    taxonLink: "iNaturalist Taxon:",
    commonName: "&#xfeff;", //"Common Name:",
    reportingStatus: "Status:",
    hulqName: "Hul'qumi'num name:",
    wikipediaSummary: "Wikipedia Summary",
    media: "Media",
    observationData: "Observation Data",
    iNaturalistTaxonImage: "iNaturalist Taxon Image:",
    phyloPic: "Taxon Icon:",
    taxonPic: "Taxon Picture:",
    taxonPicDescription: "Taxon Picture Description:"
};

hortis.friendlyDisplayLookup = {
    ...hortis.taxonDisplayLookup,
    iNaturalistTaxonName: "Species:"
};

hortis.commonFields = ["commonName", "wikipediaSummary"];

hortis.dumpRow = function (key, value, markup, extraClazz, valueClazz, options) {
    if (value) {
        const toLook = options?.friendlyNames ? hortis.friendlyDisplayLookup : hortis.taxonDisplayLookup;
        const keyName = key ? (toLook[key] || hortis.capitalize(key)) : "";
        valueClazz = valueClazz || "";
        const openPanel = options?.openTaxonPanels[key];
        const isRemainder = extraClazz && extraClazz.includes("taxonDisplay-expandable-remainder");
        const clazz = "taxonDisplay-row " + (extraClazz || "") + (openPanel ? " taxonDisplay-expanded" : " taxonDisplay-unexpanded");
        return fluid.stringTemplate(markup.taxonDisplayRow, {
            key: isRemainder ? "" : keyName,
            value: value,
            rootAttrs: "class=\"" + clazz + "\"",
            valueClazz: valueClazz
        });
    } else {
        return "";
    }
};

hortis.renderDate = function (date) {
    return new Date(date).toISOString().substring(0, 10);
};

hortis.expandButtonMarkup = "<span class=\"taxonDisplay-expand\"></span>";

hortis.expandableBlock =
    "<div class=\"%blockClazz taxonDisplay-expandable-header taxonDisplay-runon-header %state\">%blockName" + hortis.expandButtonMarkup + "</div>" +
    "<div class=\"taxonDisplay-expandable-remainder taxonDisplay-runon-remainder %state\">%block</div>";


hortis.sourceTable = { // TODO: get this from marmalised.json but the names currently there are too long
    iNat: "iNaturalist",
    PMLS: "Pacific Marine Life Surveys",
    RBCM: "Royal British Columbia Museum",
    CMN: "Canadian Museum of Nature",
    BCCSN: "British Columbia Cetacean Sightings Network",
    "Gal-Salm": "Erickson",
    CHU2010: "Chu and Leys (2010)",
    CHU2012: "Chu and Leys (2012)",
    Hunterston: "Hunterston Farms BioBlitz 2010"
};

/** Decode data collection from an observation id from a colon-separated prefix
 * @param {String} obsId - The observation id to be decoded
 * @return {String|null} The observation's collection if the observation id was qualified with a prefix, else null
 */
hortis.sourceFromId = function (obsId) {
    const colpos = obsId ? obsId.indexOf(":") : -1;
    return colpos === -1 ? null : obsId.substring(0, colpos);
};

hortis.datasetIdFromObs = function (obsId) {
    const colpos = obsId.indexOf(":");
    return obsId.substring(0, colpos);
};

hortis.localIdFromObs = function (obsId) {
    const colpos = obsId.indexOf(":");
    return obsId.substring(colpos + 1);
};

hortis.renderObsId = function (obsId) {
    const dataset = hortis.datasetIdFromObs(obsId);
    if (dataset === "iNat") {
        const localId = hortis.localIdFromObs(obsId);
        return fluid.stringTemplate(" (<a target=\"_blank\" href=\"https://www.inaturalist.org/observations/%obsId\">%obsId</a>)", {
            obsId: localId
        });
    } else {
        return obsId;
    }
};

// Render a set of fields derived from an "observation range" - group of fields prefixed by "first" and "last"
// including date/time/recordedBy/collection
hortis.renderObsBound = function (row, prefix, markup, options) {
    const date = row[prefix + "Timestamp"];
    if (date) {
        const capPrefix = prefix === "since" ? "" : hortis.capitalize(prefix);
        const recordedBy = row[prefix + "RecordedBy"];
        const catalogueNumber = row[prefix + "CatalogueNumber"];
        const value = hortis.renderDate(row[prefix + "Timestamp"]) + (recordedBy && !options.suppressObsAuthors ? " by " + recordedBy : "");

        const row1 = hortis.dumpRow(capPrefix + (prefix === "since" ? "First Observed:" : " Reported:"), value, markup);

        const obsId = row[prefix + "ObservationId"];

        // old-fashioned data used to use "Collection" - note that obsIds for Howe are currently screwed up so we use institutionCode
        // in prefewrence
        const collection = row[prefix + "Collection"];
        const institutionCode = row[prefix + "InstitutionCode"];

        const obsIdCollection = hortis.sourceFromId(row[prefix + "ObservationId"]);
        const renderedCollection = institutionCode || hortis.sourceTable[obsIdCollection || collection] || collection;

        let source = renderedCollection + (catalogueNumber && institutionCode !== "iNaturalist" ? " (" + catalogueNumber + ")" : "");
        // Two alternative routes to identifying an iNaturalist observation old-style and GBIF-style
        if (obsId && obsIdCollection === "iNat") {
            source += hortis.renderObsId(obsId);
        }
        if (catalogueNumber && institutionCode === "iNaturalist") {
            source += hortis.renderObsId("iNat:" + catalogueNumber);
        }

        const row2 = hortis.dumpRow("Source:", source, markup);

        return row1 + row2;
    } else {
        return "";
    }
};

hortis.mediaBlock =
    "<div class=\"imerss-media-name\">%mediaName</div>" +
    "<div class=\"imerss-media-image\"><a href=\"%mediaTarget\"><img src=\"%mediaImage\"/></a></div>" +
    "<div class=\"imerss-media-text\">%mediaText</div>";

hortis.renderOneMedium = function (medium) {
    return fluid.stringTemplate(hortis.mediaBlock, {
        mediaName: medium.Name,
        mediaTarget: medium.URL,
        mediaImage: medium.Thumbnail,
        mediaText: medium.Description
    });
};

hortis.renderExpandable = function (terms, expanded) {
    const allTerms = {
        ...terms,
        state: expanded ? "taxonDisplay-expanded" : "taxonDisplay-unexpanded"
    };
    return fluid.stringTemplate(hortis.expandableBlock, allTerms);
};

hortis.renderMedia = function (media) {
    const mediaBlocks = media.map(oneMedium => hortis.renderOneMedium(oneMedium));
    return mediaBlocks.join("\n");
};

hortis.hulqValues = ["Food", "Medicinal", "Spiritual", "Material", "Trade", "Indicator"];

hortis.hulqValueItem = `
<div class=\"imerss-cultural-value\">
    <div role=\"img\" class=\"imerss-value-%img imerss-cultural-value-img\"></div>
    <div class=\"imerss-cultural-value-text\">%label</div>
</div>`;

hortis.hulqValueBlock = `<div class="imerss-cultural-values">%valueBlocks</div>`;

hortis.drivePlayerTemplate = `<iframe frameborder="0" width="360" height="55" src="%url"></iframe>`;

hortis.audioPlayerTemplate = `<audio controls><source src="%url" type="audio/mpeg"></audio>`;

hortis.driveToPreview = function (url) {
    const lastSlash = url.lastIndexOf("/");
    return url.substring(0, lastSlash) + "/preview";
};


hortis.renderAudioLink = function (audioLink) {
    return audioLink ? fluid.stringTemplate(hortis.audioPlayerTemplate, {
        url: audioLink
    }) : "";
};

hortis.dumpHulqName = function (row, hulqName, markup) {
    const player = hortis.renderAudioLink(row.audioLink);
    const nameRow = hortis.dumpRow("hulqName", `<div>${hulqName}</div>` + player, markup);
    return nameRow;
};

hortis.dumpHulqValues = function (row, markup) {
    const valueBlocks = hortis.hulqValues.map(function (value) {
        return row[value.toLowerCase() + "Value"] === "1" ? value : "missing";
    }).map(function (img, index) {
        return img === "missing" ? "" :
            fluid.stringTemplate(hortis.hulqValueItem, {
                img: img.toLowerCase(),
                label: hortis.hulqValues[index]
            });
    });
    const valueBlock = fluid.stringTemplate(hortis.hulqValueBlock, {
        valueBlocks: valueBlocks.join("\n")
    });

    const valueRow1 = hortis.dumpRow("Cultural values", " ", markup, "taxonDisplay-empty-header");
    const valueRow2 = hortis.dumpRow("", valueBlock, markup, "taxonDisplay-empty-row");
    return valueRow1 + valueRow2;
};

hortis.iNatExtern =
    `<a href="%iNatLink" target="_blank" class="taxonDisplay-iNat-extern">iNaturalist<span class="external-link"></span></a>`;


hortis.imageTemplate = `
    <div class="taxonDisplay-image-holder">
        <div class="imerss-photo" style="background-image: url(%imgUrl)"/>
        %iNatExtern
        </div>
        <div class="imerss-photo-caption">
        %photoCaption
        </div>
    </div>`;

hortis.idToTaxonLink = function (taxonId) {
    return "https://www.inaturalist.org/taxa/" + taxonId;
};

hortis.renderTaxonDisplay = function (row, accessRow, markup, options) {
    if (!row) {
        return null;
    }
    let togo = markup.taxonDisplayHeader;
    const dumpRow = function (keyName, value, extraClazz, options) {
        if (keyName === "wikipediaSummary" && value) {
            // TODO: currently wikipediaSummary hard-defaults to closed on render
            // TODO: move to hortis.expandableBlock
            const row1 = hortis.dumpRow("Wikipedia Summary", hortis.expandButtonMarkup, markup, "taxonDisplay-expandable-header taxonDisplay-unexpanded taxonDisplay-runon-header");
            const row2 = hortis.dumpRow("", value, markup, "taxonDisplay-expandable-remainder taxonDisplay-unexpanded taxonDisplay-runon-remainder", "taxonDisplay-wikipediaSummary");
            togo += row1 + row2;
        } else {
            togo += hortis.dumpRow(keyName, value, markup, extraClazz, undefined, options);
        }
    };
    const dumpImage = function (keyName, url, taxonId, photoCaption) {
        const imageMarkup = fluid.stringTemplate(markup.imageTemplate, {
            imgUrl: url,
            photoCaption,
            iNatExtern: taxonId ? fluid.stringTemplate(hortis.iNatExtern, {
                iNatLink: hortis.idToTaxonLink(taxonId)
            }) : ""
        });
        // TODO: key name is currently ignored - other types of images, e.g. phylopics, and obs images, can't be distinguished
        togo += imageMarkup;
    };
    const dumpPhyloPic = function (keyName, url) {
        togo += hortis.dumpRow(keyName, `<div><img alt="Taxon photo" height="150" width="150" class="imerss-photo" src="${url}"></div>`, markup);
    };
    const photoCaption = `<div>${accessRow.featuredName}</div>` + hortis.renderAudioLink(row.audioLink);
    if (!row.taxonName) { // It's a higher taxon with no direct obs
        if (row.iNaturalistTaxonImage && !row.taxonPic) {
            dumpImage("iNaturalistTaxonImage", row.iNaturalistTaxonImage, row.id, photoCaption);
        } else if (row.taxonPic) {
            dumpImage("taxonPic", row.taxonPic);
        }
        if (row.phyloPicUrl) {
            dumpPhyloPic("phyloPic", row.phyloPicUrl);
        }
        dumpRow(row.rank, accessRow.scientificName, "taxonDisplay-rank");
        hortis.commonFields.forEach(function (field) {
            dumpRow(field, row[field]);
        });
        dumpRow("taxonPicDescription", row.taxonPicDescription);
        dumpRow("Species:", row.childCount);
        dumpRow("observationCount", row.observationCount);
    } else {
        if (row.iNaturalistTaxonImage && !row.obsPhotoLink) {
            dumpImage("iNaturalistTaxonImage", row.iNaturalistTaxonImage, row.id, photoCaption);
        }
        if (row.species) { // TODO: Barentsia sp. does not have species - presumably we should just dump anything here?
            // TODO: Need to revisit nutty system whereby we don't write "rank" for leaves. Need a special signal to
            // determine "there are any obs at this level".
            // Used to read:
            // dumpRow("Species:", row.species + (row.authority ? (" " + row.authority) : ""), "taxonDisplay-rank");
            // "species" now just holds raw species name. In the long term we should support our own normalised species name
            // composed of taxon and infrataxon name but this is at least now complete and agrees with what is shown in the tooltip
            dumpRow("iNaturalistTaxonName", (row.taxonName || row.iNaturalistTaxonName) + (row.authority ? (" " + row.authority) : ""), "taxonDisplay-rank", options);
        }
        // We now dump this as featuredName to right of photo
        /*
        if (accessRow.nativeName) {
            togo += hortis.dumpHulqName(row, accessRow.nativeName, markup);
        }*/
        if (accessRow.commonName !== accessRow.featuredName) {
            dumpRow("commonName", row.commonName && hortis.capitalize(row.commonName));
        }

        if (accessRow.nativeName && options.culturalValues) {
            togo += hortis.dumpHulqValues(row, markup);
        }

        if (row.media) {
            const mediaPanel = hortis.renderMedia(row.media, "");
            togo += hortis.dumpRow("media", hortis.expandButtonMarkup, markup, "taxonDisplay-expandable-header", null, options);
            togo += hortis.dumpRow("media", mediaPanel, markup, "taxonDisplay-expandable-remainder taxonDisplay-runon-remainder", null, options);
        }

        dumpRow("wikipediaSummary", row.wikipediaSummary);
        let obsPanel = "";

        obsPanel += hortis.dumpRow("reportingStatus", row.reportingStatus && hortis.capitalize(row.reportingStatus), markup);
        obsPanel += hortis.renderObsBound(row, "first", markup, options);
        obsPanel += hortis.renderObsBound(row, "last", markup, options);
        obsPanel += hortis.renderObsBound(row, "since", markup, options);

        if (row.iNaturalistObsLink) {
            obsPanel += hortis.dumpRow("iNaturalistObsLink", `<a href=${row.iNaturalistObsLink}">${row.iNaturalistObsLink}</a>`, markup);
        }
        obsPanel += hortis.dumpRow("observationCount", row.observationCount, markup);

        // TODO: Move to hortis.expandableBlock - hard since taxonDisplay-key and taxonDisplay-value
        // are nested inside here, but they are not in the outer map panels
        togo += hortis.dumpRow("observationData", hortis.expandButtonMarkup, markup, "taxonDisplay-expandable-header", null, options);
        togo += hortis.dumpRow("observationData", obsPanel, markup, "taxonDisplay-expandable-remainder taxonDisplay-runon-remainder", null, options);

        if (row.obsPhotoLink) {
            // See this nonsense: https://stackoverflow.com/questions/5843035/does-before-not-work-on-img-elements
            dumpImage("Observation photo", row.obsPhotoLink);
        }

        /** Axed per AS email 16/10/21
         var iNatId = row.iNaturalistTaxonId;
         if (iNatId) {
            var taxonLink = "http://www.inaturalist.org/taxa/" + iNatId;
            dumpRow("taxonLink", "<a href=\"" + taxonLink + "\">" + taxonLink + "</a>");
        }*/
    }

    togo += markup.taxonDisplayFooter;
    return togo;
};

hortis.bindRowExpander = function (that) {
    that.container.on("click", ".taxonDisplay-expand", function (e) {
        const target = $(e.target);
        const header = target.closest(".taxonDisplay-expandable-header");
        header.toggleClass("taxonDisplay-expanded");
        header.toggleClass("taxonDisplay-unexpanded");
        const showing = header.hasClass("taxonDisplay-expanded");
        const siblings = header.parent().children();
        const ownIndex = header.index();
        const next = $(siblings[ownIndex + 1]);
        if (next.hasClass("taxonDisplay-expandable-remainder")) { // sanity check, we should not render ones without this
            next.toggleClass("taxonDisplay-expanded", showing);
            next.toggleClass("taxonDisplay-unexpanded", !showing);
        }
    });
};

hortis.updateTaxonDisplay = function (that, taxonRow) {
    const content = taxonRow ? hortis.renderTaxonDisplay(taxonRow, that.accessRow(taxonRow), that.options.markup, that.options) : null;
    const taxonDisplay = that.container[0];
    taxonDisplay.innerHTML = content || "";
};

fluid.defaults("hortis.taxonDisplay", {
    gradeNames: "fluid.viewComponent",
    listeners: {
        "onCreate.bindRowExpander": {
            funcName: "hortis.bindRowExpander",
            args: ["{that}"]
        }
    },
    invokers: {
        accessRow: {
            funcName: "hortis.accessRowHulq"
        }
    },
    markup: {
        taxonDisplayHeader: "",
        taxonDisplayRow: "<div %rootAttrs><span class=\"taxonDisplay-key\">%key</span><span class=\"taxonDisplay-value %valueClazz\">%value</span></div>",
        taxonDisplayFooter: "",
        imageTemplate: hortis.imageTemplate
    },
    members: {
        selectedTaxonId: "@expand:signal()",
        obsRows: "@expand:signal()",
        // Needs to be injected from outside - e.g. xetthecum.js has "{vizLoader}.taxa.rowById",
        taxaById: "@expand:signal()",
        obsForTaxonId: "@expand:fluid.computed(hortis.obsForTaxon, {that}.obsRows, {that}.selectedTaxonId)",
        taxonRow: "@expand:fluid.computed(hortis.computeTaxonDisplayRow, {that}.obsForTaxonId, {that}.taxaById, {that}.selectedTaxonId)",
        updateDisplay: "@expand:fluid.effect(hortis.updateTaxonDisplay, {that}, {that}.taxonRow)"
    },
    openTaxonPanels: {
        observationData: true,
        media: true
    }
    // culturalValues
    // suppressObsAuthors
});

hortis.byField = function (fieldName) {
    return (a, b) => a[fieldName] > b[fieldName] ? 1 : -1;
};

hortis.obsForTaxon = function (obsRows, taxonId) {
    return obsRows.filter(row => row["iNaturalist taxon ID"] === taxonId).sort(hortis.byField("Date observed"));
};

// Fields which are transferred to "first" and "last" entries from observations to summaries
// Reduced set taken from taxonomise.js, unpacked in renderObsBound
hortis.obsToSummaryFields = {
    RecordedBy: "Recorded by",
    // collection: "Source", // old-fashioned pre-GBIF field - being phased out - would have been "collectionCode" which is not so useful
    // institutionCode: "Institution Code",
    // placeName: "Place Name",
    // catalogueNumber: "Catalogue Number",
    ObservationId: "observationId",
    Timestamp: "Date observed"
};


hortis.computeTaxonDisplayRow = function (taxonObs, taxaById, taxonId) {
    if (taxonId) {
        const togo = Object.assign({}, taxaById[taxonId]);
        const obsToFields = function (target, prefix, row) {
            // const obsIdCollection = hortis.sourceFromId(row.observationId);
            // TODO: if obsIdCollection is iNat, populate "since"
            Object.entries(hortis.obsToSummaryFields).forEach(([key, value]) => {
                target[prefix + key] = row[value];
            });
        };
        if (taxonObs.length > 0) {
            obsToFields(togo, "first", taxonObs[0]);
            obsToFields(togo, "last", fluid.peek(taxonObs));
        }
        return togo;
    } else {
        return null;
    }
};
