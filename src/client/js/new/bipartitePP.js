/* global d3, viz */

"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var imerss = imerss || {};

// String measurement cribbed from https://stackoverflow.com/a/48172630/1381443
imerss.charWidths = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.28,0.28,0.35,0.55,0.55,0.89,0.67,0.19,0.33,0.33,0.39,0.58,0.28,0.33,0.28,0.3,0.55,0.55,0.55,0.55,0.55,0.55,0.55,0.55,0.55,0.55,0.28,0.28,0.58,0.58,0.58,0.55,1.01,0.67,0.67,0.72,0.72,0.67,0.61,0.78,0.72,0.28,0.5,0.67,0.55,0.83,0.72,0.78,0.67,0.78,0.72,0.67,0.61,0.72,0.67,0.94,0.67,0.67,0.61,0.28,0.35,0.28,0.48,0.55,0.33,0.55,0.55,0.5,0.55,0.55,0.28,0.55,0.55,0.22,0.24,0.5,0.22,0.83,0.55,0.55,0.55,0.55,0.33,0.5,0.28,0.55,0.50,0.72,0.5,0.5,0.5,0.35,0.26,0.35,0.59];
imerss.avgWidth = 0.53;

imerss.measureText = function (str) {
    return Array.from(str).reduce(
        (acc, cur) => acc + (imerss.charWidths[cur.charCodeAt(0)] ?? imerss.avgWidth), 0
    );
};

imerss.maxTextWidth = function (labels, fontSize) {
    return labels.map(label => label.toString()).reduce((max, label) => {
        return Math.max(max, imerss.measureText(label));
    }, 0) * fontSize * 1.02; // Add on 2% since our font seems just a touch wider than the respondent's
};

imerss.bipartitePP = function (data, svg, width, height, options) { // eslint-disable-line no-unused-vars
    const {sortedBeeNames, sortedPlantNames, beeColors, FigureLabel} = options;

    // const IndivFigSizeX = 400; // here will become = IndivFigSizeX
    // const IndivFigSizeY = 1000; // here will become = IndivFigSizeY

    // this group of variables should always be the same
    // const ColourBy  = 1;
    // const colouroption = "manual";
    const BarWidth = 35;
    const MinWidth = 10;
    const MinFigWidth = 120;
    const Pad = 2.25;
    const IncludeCount = 1;

    const LabelPad = 10;

    const fontSize = parseInt(getComputedStyle(svg.node()).getPropertyValue("font-size"));

    const Orientation = "vertical";
    const PrimaryLab =  "Bees" ;
    const SecondaryLab = "Plants";

    // const mpA = 1;
    // const mpB = 1;

    const lengMaxBee = imerss.maxTextWidth(data.map(element => element[0]), fontSize);
    const lengMaxPlant = imerss.maxTextWidth(data.map(element => element[1]), fontSize);

    // Compute actual marginal counts so we can size column correctly - this will duplicate calculation within biPartitePP
    const beeCounts = Object.fromEntries(sortedBeeNames.map(name => [name, 0]));
    const plantCounts = Object.fromEntries(sortedPlantNames.map(name => [name, 0]));
    data.forEach(row => {
        beeCounts[row[0]] += row[2];
        plantCounts[row[1]] += row[2];
    });

    const beeCountWidth = imerss.maxTextWidth(Object.values(beeCounts), fontSize);
    const plantCountWidth = imerss.maxTextWidth(Object.values(plantCounts), fontSize);

    const BoxLabPosBee = -LabelPad - BarWidth / 2;
    const BoxLabPosPlant = LabelPad + BarWidth / 2;

    // original - BoxLabPos <- (c(max(stringr::str_length(df[, 1])), max(stringr::str_length(df[, 2]))) * 1.2) + 20

    const countPadding = 10;

    // original - PercPos <- (BoxLabPos) * 7 + c(-5, 20)
    const CountPosBee = BoxLabPosBee - countPadding - lengMaxBee;
    const CountPosPlant = BoxLabPosPlant + countPadding + lengMaxPlant;

    //original - LeftSidePadding = 20 + BoxLabPos[bee] + IncludePerc * PercPos[bee] - change include perc to 1
    const LeftSidePadding = -CountPosBee + (IncludeCount ? beeCountWidth : 0);
    const RightSidePadding = CountPosPlant + (IncludeCount ? plantCountWidth : 0);

    // const totalWidth = LeftSidePadding + MainFigSizeX + RightSidePadding;

    //const RightSidePadding = 20 + BoxLabPosPlant + IncludePerc * PercPosPlant;
    //original RightSidePadding = 20 + BoxLabPos[2] + IncludePerc * PercPos[2]


    //const TotalNeededSidePadding = 20 + BoxLabPosBee + BoxLabPosPlant + IncludePerc * (PercPosPlant + PercPosBee) + BarSize + IndivFigSizeX;
    //original -TotalNeededSidePadding = sum(20 + BoxLabPos + IncludePerc *  PercPos) + BarSize + IndivFigSize[1]

    //const WPerPlot = (MainFigSizeX - LeftSidePadding) / mpB;
    //original - WPerPlot <- (MainFigSize[x] - LeftSidePadding)/mp[2]

    // All labels end up in a transform that shifts half a bar width outwards
    const ColPos = LeftSidePadding - BarWidth / 2; // simplified from original, will need work if wanting to more than one facet
    //original - ColPos <- rep(floor(seq(from = LeftSidePadding, by = WPerPlot,
    //                        length = mp[2])), mp[a])

    //const HPerPlot = (MainFigSizeY - 100) / mpA;
    //original - HPerPlot <- (MainFigSize[2] - 100)/mp[a]
    const RowPos = 30; // simplified for now, another multiple facet problem
    //RowPos <- rep(floor(seq(from = 50, by = HPerPlot, length = mp[a])),
    //              each = mp[2])

    const MainFigSizeX = Math.max(width - LeftSidePadding - RightSidePadding, MinFigWidth);
    const MainFigSizeY = Math.max(height, sortedBeeNames.length * 20, sortedPlantNames.length * 20) - RowPos;

    function sort(sortOrder) {
        return function (a,b) {
            return d3.ascending(sortOrder.indexOf(a), sortOrder.indexOf(b));
        };
    }

    svg.html("");

    const g1 = svg.append("g").attr("transform", `translate(${ColPos},${RowPos})`);

    const bp1 = viz.bP()
        .data(data)
        .value(d => d[2])
        .min(MinWidth)  // standard
        .pad(Pad)  // standard
        .height(MainFigSizeY)
        .width(MainFigSizeX) // "^ same"
        .barSize(BarWidth) // this is standard
        .fill(d => beeColors[d.primary]) // this too (assuming we are colouring by bees)
        .orient(Orientation)
        .sortPrimary(sort(sortedBeeNames))
        .sortSecondary(sort(sortedPlantNames));

    g1.call(bp1); g1.append("text")
        .attr("x", 17.5).attr("y", -8)
        .style("text-anchor", "middle")
        .text(PrimaryLab).attr("class", "bipartite-label");

    g1.append("text")
        .attr("x", (MainFigSizeX - BarWidth / 2))
        .attr("y", -8).style("text-anchor","middle")
        .text(SecondaryLab).attr("class", "bipartite-label");;

    g1.append("text")
        .attr("x",((MainFigSizeX - BarWidth) / 2)).attr("y", -25)
        .style("text-anchor", "middle")
        .attr("class", "header")
        .text(FigureLabel); // comes from subset name - only applicable sometimes

    g1.selectAll(".mainBars").append("text").attr("class", "label")
        .attr("x", d => (d.part === "primary" ? BoxLabPosBee : BoxLabPosPlant))
        .attr("y", 6)
        .text(d => d.key)
        .attr("text-anchor", d => (d.part === "primary" ? "end" : "start"));

    if (IncludeCount) {
        g1.selectAll(".mainBars").append("text").attr("class", "lab")
            .attr("x", d => (d.part === "primary" ? CountPosBee : CountPosPlant))
            .attr("y", 6)
            .text(function (d) {
                return (d.value);
            })
            .attr("text-anchor", d => (d.part === "primary" ? "end" : "start"));
    }

    // none of below needs modification either unless we get into more than one facet
    function mouseover(d) {
        bp1.mouseover(d);
        g1.selectAll(".mainBars")
            .select(".lab")
            .text(function (d) { return (d.value);});
    }

    function mouseout(d) {
        bp1.mouseout(d);
        g1.selectAll(".mainBars")
            .select(".lab")
            .text(function (d) { return (d.value);});
    }

    g1.selectAll(".mainBars") // no changes
        .on("mouseover", mouseover)
        .on("mouseout", mouseout);

    return {
        // Add on a little for scrollbars
        renderedWidth: 8 + MainFigSizeX + LeftSidePadding + RightSidePadding - BarWidth,
        // Add on a little for descenders and a hanging bottom row of text
        renderedHeight: fontSize + MainFigSizeY + RowPos
    };

};
