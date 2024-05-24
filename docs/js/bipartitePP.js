/* global d3, viz */

"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var imerss = imerss || {};

imerss.bipartitePP = function (data, svg, height, width, options) { // eslint-disable-line no-unused-vars
    const {sortedBeeNames, beeColors, FigureLabel, MainFigSizeX, MainFigSizeY} = options;

    // const IndivFigSizeX = 400; // here will become = IndivFigSizeX
    // const IndivFigSizeY = 1000; // here will become = IndivFigSizeY

    // this group of variables should always be the same
    // const ColourBy  = 1;
    // const colouroption = "manual";
    const BarSize = 35;
    const MinWidth = 10;
    const Pad = 2.25;
    const IncludeCount = 1;

    const LabelPad = 30;

    const fontSize = parseInt(getComputedStyle(svg.node()).getPropertyValue("font-size"));

    // "Megachilidae" at 14px is of width 83px, approx 7px so pick 50% of the font size as average
    const fontScale = 0.5 * fontSize;

    const Orientation = "vertical";
    const PrimaryLab =  "Bees" ;
    const SecondaryLab = "Plants";

    // const mpA = 1;
    // const mpB = 1;

    // below are the calculations that are now done here instead of in R

    const lengMaxPlant = data.reduce((max, element) => {
        return Math.max(max, element[1].length);
    }, 0);
    const lengMaxBee = data.reduce((max, element) => {
        return Math.max(max, element[0].length);
    }, 0);

    // const BoxLabPosBee = -lengMaxBee * fontScale;
    // const BoxLabPosPlant = lengMaxPlant * fontScale;

    const BoxLabPosBee = -LabelPad;
    const BoxLabPosPlant = LabelPad;

    // original - BoxLabPos <- (c(max(stringr::str_length(df[, 1])), max(stringr::str_length(df[, 2]))) * 1.2) + 20

    const countWidth = 5,
        countPadding = 5;

    // original - PercPos <- (BoxLabPos) * 7 + c(-5, 20)
    const CountPosBee = BoxLabPosBee - countPadding - lengMaxBee * fontScale;
    const CountPosPlant = BoxLabPosPlant + countPadding + lengMaxPlant * fontScale;

    //original - LeftSidePadding = 20 + BoxLabPos[bee] + IncludePerc * PercPos[bee] - change include perc to 1
    const LeftSidePadding = -CountPosBee + (IncludeCount ? countWidth * fontScale : 0);
    const RightSidePadding = CountPosPlant + (IncludeCount ? countWidth * fontScale : 0);

    const totalWidth = LeftSidePadding + MainFigSizeX + RightSidePadding;

    //const RightSidePadding = 20 + BoxLabPosPlant + IncludePerc * PercPosPlant;
    //original RightSidePadding = 20 + BoxLabPos[2] + IncludePerc * PercPos[2]


    //const TotalNeededSidePadding = 20 + BoxLabPosBee + BoxLabPosPlant + IncludePerc * (PercPosPlant + PercPosBee) + BarSize + IndivFigSizeX;
    //original -TotalNeededSidePadding = sum(20 + BoxLabPos + IncludePerc *  PercPos) + BarSize + IndivFigSize[1]

    //const WPerPlot = (MainFigSizeX - LeftSidePadding) / mpB;
    //original - WPerPlot <- (MainFigSize[x] - LeftSidePadding)/mp[2]

    const ColPos = LeftSidePadding; // simplified from original, will need work if wanting to more than one facet
    //original - ColPos <- rep(floor(seq(from = LeftSidePadding, by = WPerPlot,
    //                        length = mp[2])), mp[a])

    //const HPerPlot = (MainFigSizeY - 100) / mpA;
    //original - HPerPlot <- (MainFigSize[2] - 100)/mp[a]
    const RowPos = 50; // simplified for now, another multiple facet problem
    //RowPos <- rep(floor(seq(from = 50, by = HPerPlot, length = mp[a])),
    //              each = mp[2])

    function sort(sortOrder) {
        return function (a,b) {
            return d3.ascending(sortOrder.indexOf(a), sortOrder.indexOf(b));
        };
    }

    svg.html("");

    // function(figHeight, figWidth, translateValu = c(ColPos[i], ",", RowPos[i]))
    const g1 = svg.append("g").attr("transform", `translate(${ColPos},${RowPos})`);

    const bp1 = viz.bP()
        .data(data)
        .value(d => d[2])
        .min(MinWidth)  // standard
        .pad(Pad)  // standard
        .height(MainFigSizeY)
        .width(MainFigSizeX) // "^ same"
        .barSize(BarSize) // this is standard
        .fill(d => beeColors[d.primary]) // this too (assuming we are colouring by bees)
        .orient(Orientation)
        .sortPrimary(sort(sortedBeeNames));
        // this order is produced by sorting on bee family, then genus within family, then species (all alphabetically)
        // similarly to color, this is not possible to make given the current const data
        // will become sort (sortedBeeNames)

    g1.call(bp1); g1.append("text")
        .attr("x", 17.5).attr("y", -8)
        .style("text-anchor", "middle")
        .text(PrimaryLab);

    g1.append("text")
        .attr("x", (MainFigSizeX - 17.5)) // 382.5 comes from IndivFigSize[1]-17.5
        .attr("y", -8).style("text-anchor","middle")
        .text(SecondaryLab);

    g1.append("text")
        .attr("x",((MainFigSizeX - 17.5) / 2)).attr("y", -25) // comes from (IndivFigSize[1]-17.5)/2
        .style("text-anchor", "middle")
        .attr("class", "header")
        .text(FigureLabel); // comes from subset name - only applicable sometimes

    g1.selectAll(".mainBars") // no changes
        .on("mouseover",mouseover)
        .on("mouseout",mouseout);

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

    return {totalWidth};

};
