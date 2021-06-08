/* eslint-env node */
"use strict";

var moment = require("moment");

// Strange kind of CMN date - looks like even moment's "forgiving" parsing will not deal with the junk beyond ;
var string = "1982-06-09; time: 16:30; duration: 18 min";
var string2 = "1982-06-08; time: 20:00; duration: 14 h";

var date = moment.utc(string2, ["YYYY-MM-DD"]);

console.log(date);

console.log(date.toISOString());


var BCCSN = "09/23/12";

var bcdate = moment.utc(BCCSN, "MM/DD/YY");

console.log(bcdate.toISOString());
