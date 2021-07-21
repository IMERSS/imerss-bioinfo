/* eslint-env node */
"use strict";

var moment = require("moment-timezone");

// Strange kind of CMN date - looks like even moment's "forgiving" parsing will not deal with the junk beyond ;
var string = "1982-06-09; time: 16:30; duration: 18 min";
var string2 = "1982-06-08; time: 20:00; duration: 14 h";

var date = moment.utc(string2, ["YYYY-MM-DD"]);

console.log(date);

console.log(date.toISOString());


var BCCSN = "09/23/12";

var bcdate = moment.utc(BCCSN, "MM/DD/YY");

console.log(bcdate.toISOString());

var nodate = moment.utc("", "MM/DD/YY");

var hasTime = function (momentVal) {
    var newVal = moment(momentVal);
    newVal.seconds(0).minutes(0).hours(0);
    console.log("hasTime: " + !newVal.isSame(momentVal));
}

console.log(nodate.toISOString());
console.log(nodate.format("DD"));
console.log(nodate.isValid());

hasTime(bcdate);
hasTime(new moment());

var PMLSdate = moment.tz("1968-08-02T15:00:00", "Canada/Pacific");
console.log(PMLSdate.toISOString());

var PMLSdateZ = moment.tz("1968-08-02T15:00:00Z", "Canada/Pacific");
console.log(PMLSdateZ.toISOString());