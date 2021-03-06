(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.zipson = f()}})(function(){var define,module,exports;return (function(){function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s}return e})()({1:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var any_1 = require("./compressor/any");
var array_1 = require("./compressor/array");
var string_1 = require("./compressor/string");
var number_1 = require("./compressor/number");
var object_1 = require("./compressor/object");
var date_1 = require("./compressor/date");
var object_2 = require("./compressor/template/object");
var compressors = {
    any: any_1.compressAny,
    array: array_1.compressArray,
    object: object_1.compressObject,
    string: string_1.compressString,
    date: date_1.compressDate,
    number: number_1.compressNumber,
    template: {
        Object: object_2.TemplateObject
    }
};
/**
 * Create a new compression context
 */
function makeCompressContext() {
    return {
        arrayItemWriters: [],
        arrayLevel: 0,
    };
}
exports.makeCompressContext = makeCompressContext;
/**
 * Create an inverted index for compression
 */
function makeInvertedIndex() {
    return {
        stringMap: {},
        integerMap: {},
        floatMap: {},
        dateMap: {},
        lpDateMap: {},
        stringCount: 0,
        integerCount: 0,
        floatCount: 0,
        dateCount: 0,
        lpDateCount: 0,
    };
}
exports.makeInvertedIndex = makeInvertedIndex;
/**
 * Compress all data onto a provided writer
 */
function compress(context, obj, invertedIndex, writer, options) {
    compressors.any(compressors, context, obj, invertedIndex, writer, options);
}
exports.compress = compress;

},{"./compressor/any":2,"./compressor/array":3,"./compressor/date":4,"./compressor/number":5,"./compressor/object":6,"./compressor/string":7,"./compressor/template/object":8}],2:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var constants_1 = require("../constants");
/**
 * Compress any data type to writer
 */
function compressAny(compressors, context, obj, invertedIndex, writer, options) {
    var type = typeof obj;
    if (type === 'number') {
        compressors.number(compressors, context, obj, invertedIndex, writer, options);
    }
    else if (type === 'string') {
        compressors.string(compressors, context, obj, invertedIndex, writer, options);
    }
    else if (type === 'boolean') {
        writer.write(obj ? constants_1.BOOLEAN_TRUE_TOKEN : constants_1.BOOLEAN_FALSE_TOKEN);
    }
    else if (obj === null) {
        writer.write(constants_1.NULL_TOKEN);
    }
    else if (obj === undefined) {
        writer.write(constants_1.UNDEFINED_TOKEN);
    }
    else if (Array.isArray(obj)) {
        compressors.array(compressors, context, obj, invertedIndex, writer, options);
    }
    else if (obj instanceof Date) {
        compressors.date(compressors, context, obj.getTime(), invertedIndex, writer, options);
    }
    else {
        compressors.object(compressors, context, obj, invertedIndex, writer, options);
    }
}
exports.compressAny = compressAny;

},{"../constants":11}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var constants_1 = require("../constants");
var writer_1 = require("./writer");
var util_1 = require("../util");
/**
 * Compress array to writer
 */
function compressArray(compressors, context, array, invertedIndex, writer, options) {
    // Increase context array level and create a new element writer if needed
    context.arrayLevel++;
    if (context.arrayLevel > context.arrayItemWriters.length) {
        context.arrayItemWriters.push(new writer_1.ZipsonStringWriter());
    }
    // Get the element and parent writer
    var arrayItemWriter = context.arrayItemWriters[context.arrayLevel - 1];
    var parentWriter = context.arrayItemWriters[context.arrayLevel - 2] || writer;
    parentWriter.write(constants_1.ARRAY_START_TOKEN);
    var previousItem = '';
    var repeatedTimes = 0;
    var repeatManyCount = 0;
    // Create a template object for first two keys in object
    var templateObject = new compressors.template.Object(array[0], array[1]);
    // Compress template is templating
    if (templateObject.isTemplating) {
        templateObject.compressTemplate(compressors, context, invertedIndex, parentWriter, options);
    }
    for (var i = 0; i < array.length; i++) {
        var item = array[i];
        arrayItemWriter.value = '';
        // Make undefined elements into null values
        if (item === undefined) {
            item = null;
        }
        // Determine if still templating after the two first elements
        if (i > 1 && templateObject.isTemplating) {
            templateObject.isNextTemplateable(array[i], parentWriter);
        }
        if (templateObject.isTemplating) {
            // Compress template values if templating
            templateObject.compressTemplateValues(compressors, context, invertedIndex, arrayItemWriter, options, array[i]);
        }
        else {
            // Compress any element otherwise
            compressors.any(compressors, context, item, invertedIndex, arrayItemWriter, options);
        }
        // Check if we wrote an identical elements
        if (arrayItemWriter.value === previousItem) {
            // Count repetitions and see if we repeated enough to use a many token
            repeatedTimes++;
            if (repeatedTimes >= constants_1.ARRAY_REPEAT_COUNT_THRESHOLD) {
                // Write a many token if needed and count how many "many"-times we repeated
                if (repeatManyCount === 0) {
                    parentWriter.write(constants_1.ARRAY_REPEAT_MANY_TOKEN);
                }
                repeatManyCount++;
            }
            else {
                // Default to standard repeat token
                parentWriter.write(constants_1.ARRAY_REPEAT_TOKEN);
            }
        }
        else {
            repeatedTimes = 0;
            if (repeatManyCount > 0) {
                // If we repeated many times, write the count before the next element
                parentWriter.write(util_1.compressInteger(repeatManyCount));
                repeatManyCount = 0;
            }
            parentWriter.write(arrayItemWriter.value);
            previousItem = arrayItemWriter.value;
        }
    }
    // If still repeating may, write the final repeat count
    if (repeatManyCount > 0) {
        parentWriter.write(util_1.compressInteger(repeatManyCount));
    }
    // Finalize template object if still templating
    if (templateObject.isTemplating) {
        templateObject.end(parentWriter);
    }
    parentWriter.write(constants_1.ARRAY_END_TOKEN);
    context.arrayLevel--;
}
exports.compressArray = compressArray;

},{"../constants":11,"../util":19,"./writer":10}],4:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var constants_1 = require("../constants");
var util_1 = require("../util");
/**
 * Compress date (as unix timestamp) to writer
 */
function compressDate(compressors, context, obj, invertedIndex, writer, options) {
    var foundRef;
    /**
     * Determine if we should represent the date with low precision
     */
    var lowPrecisionDate = obj / constants_1.DATE_LOW_PRECISION;
    var isLowPrecision = lowPrecisionDate % 1 === 0;
    if (isLowPrecision) {
        if ((foundRef = invertedIndex.lpDateMap[lowPrecisionDate]) !== void 0) {
            writer.write("" + constants_1.REF_LP_DATE_TOKEN + foundRef);
        }
        else {
            var ref = util_1.compressInteger(invertedIndex.lpDateCount);
            var compressedDate = util_1.compressInteger(lowPrecisionDate);
            var newRef = "" + constants_1.LP_DATE_TOKEN + compressedDate;
            if (ref.length + constants_1.REFERENCE_HEADER_LENGTH < newRef.length) {
                invertedIndex.lpDateMap[lowPrecisionDate] = ref;
                invertedIndex.lpDateCount++;
                writer.write(newRef);
            }
            else {
                writer.write("" + constants_1.UNREFERENCED_LP_DATE_TOKEN + compressedDate);
            }
        }
    }
    else {
        if ((foundRef = invertedIndex.dateMap[obj]) !== void 0) {
            writer.write("" + constants_1.REF_DATE_TOKEN + foundRef);
        }
        else {
            var ref = util_1.compressInteger(invertedIndex.dateCount);
            var compressedDate = util_1.compressInteger(obj);
            var newRef = "" + constants_1.DATE_TOKEN + compressedDate;
            if (ref.length + constants_1.REFERENCE_HEADER_LENGTH < newRef.length) {
                invertedIndex.dateMap[obj] = ref;
                invertedIndex.dateCount++;
                writer.write(newRef);
            }
            else {
                writer.write("" + constants_1.UNREFERENCED_DATE_TOKEN + compressedDate);
            }
        }
    }
}
exports.compressDate = compressDate;

},{"../constants":11,"../util":19}],5:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var constants_1 = require("../constants");
var util_1 = require("../util");
/**
 * Compress number (integer or float) to writer
 */
function compressNumber(compressors, context, obj, invertedIndex, writer, options) {
    var foundRef;
    if (obj % 1 === 0) {
        // CHeck if the value is a small integer
        if (obj < constants_1.INTEGER_SMALL_EXCLUSIVE_BOUND_UPPER && obj > constants_1.INTEGER_SMALL_EXCLUSIVE_BOUND_LOWER) {
            writer.write(constants_1.INTEGER_SMALL_TOKENS[obj + constants_1.INTEGER_SMALL_TOKEN_ELEMENT_OFFSET]);
        }
        else if ((foundRef = invertedIndex.integerMap[obj]) !== void 0) {
            writer.write("" + constants_1.REF_INTEGER_TOKEN + foundRef);
        }
        else {
            var ref = util_1.compressInteger(invertedIndex.integerCount);
            var compressedInteger = util_1.compressInteger(obj);
            var newRef = "" + constants_1.INTEGER_TOKEN + compressedInteger;
            if (ref.length + constants_1.REFERENCE_HEADER_LENGTH < newRef.length) {
                invertedIndex.integerMap[obj] = ref;
                invertedIndex.integerCount++;
                writer.write(newRef);
            }
            else {
                writer.write("" + constants_1.UNREFERENCED_INTEGER_TOKEN + compressedInteger);
            }
        }
    }
    else {
        // Compress float prior to lookup to reuse for "same" floating values
        var compressedFloat = util_1.compressFloat(obj, options.fullPrecisionFloats);
        if ((foundRef = invertedIndex.floatMap[compressedFloat]) !== void 0) {
            writer.write("" + constants_1.REF_FLOAT_TOKEN + foundRef);
        }
        else {
            var ref = util_1.compressInteger(invertedIndex.floatCount);
            var newRef = "" + constants_1.FLOAT_TOKEN + compressedFloat;
            if (ref.length + constants_1.REFERENCE_HEADER_LENGTH < newRef.length) {
                invertedIndex.floatMap[compressedFloat] = ref;
                invertedIndex.floatCount++;
                writer.write(newRef);
            }
            else {
                writer.write("" + constants_1.UNREFERENCED_FLOAT_TOKEN + compressedFloat);
            }
        }
    }
}
exports.compressNumber = compressNumber;

},{"../constants":11,"../util":19}],6:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var constants_1 = require("../constants");
/**
 * Compress object to writer
 */
function compressObject(compressors, context, obj, invertedIndex, writer, options) {
    writer.write(constants_1.OBJECT_START_TOKEN);
    var keys = Object.keys(obj);
    // Create a template object for first two keys in object
    var templateObject = new compressors.template.Object(obj[keys[0]], obj[keys[1]]);
    // Compress template is templating
    if (templateObject.isTemplating) {
        templateObject.compressTemplate(compressors, context, invertedIndex, writer, options);
    }
    for (var i = 0; i < keys.length; i++) {
        // Determine if still templating after the two first keys
        if (i > 1 && templateObject.isTemplating) {
            templateObject.isNextTemplateable(obj[keys[i]], writer);
        }
        if (templateObject.isTemplating) {
            // Compress id and template values if templating
            compressors.string(compressors, context, keys[i], invertedIndex, writer, options);
            templateObject.compressTemplateValues(compressors, context, invertedIndex, writer, options, obj[keys[i]]);
        }
        else {
            // Compress object key and value if not templating
            var key = keys[i];
            var val = obj[key];
            if (val !== undefined) {
                compressors.string(compressors, context, key, invertedIndex, writer, options);
                compressors.any(compressors, context, val, invertedIndex, writer, options);
            }
        }
    }
    ;
    // Finalize template object if still templating
    if (templateObject.isTemplating) {
        templateObject.end(writer);
    }
    writer.write(constants_1.OBJECT_END_TOKEN);
}
exports.compressObject = compressObject;

},{"../constants":11}],7:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var constants_1 = require("../constants");
var util_1 = require("../util");
/**
 * Compress string to
 */
function compressString(compressors, context, obj, invertedIndex, writer, options) {
    var foundRef;
    //
    var stringIdent = constants_1.STRING_IDENT_PREFIX + obj;
    // Detect if string is utc timestamp if enabled
    if (options.detectUtcTimestamps && obj[obj.length - 1] === 'Z' && obj.match(constants_1.DATE_REGEX)) {
        var date = Date.parse(obj);
        compressors.date(compressors, context, date, invertedIndex, writer, options);
    }
    else if ((foundRef = invertedIndex.stringMap[stringIdent]) !== void 0) {
        writer.write("" + constants_1.REF_STRING_TOKEN + foundRef);
    }
    else {
        var ref = util_1.compressInteger(invertedIndex.stringCount);
        var newRef = "" + constants_1.STRING_TOKEN + obj.replace(constants_1.REGEX_ESCAPE_CHARACTER, constants_1.ESCAPE_CHARACTER + constants_1.ESCAPE_CHARACTER).replace(constants_1.REGEX_STRING_TOKEN, constants_1.ESCAPED_STRING_TOKEN) + constants_1.STRING_TOKEN;
        if (ref.length + constants_1.REFERENCE_HEADER_LENGTH + 1 < newRef.length) {
            invertedIndex.stringMap[stringIdent] = ref;
            invertedIndex.stringCount++;
            writer.write(newRef);
        }
        else {
            writer.write("" + constants_1.UNREFERENCED_STRING_TOKEN + obj.replace(constants_1.REGEX_ESCAPE_CHARACTER, constants_1.ESCAPE_CHARACTER + constants_1.ESCAPE_CHARACTER).replace(constants_1.REGEX_UNREFERENCED_STRING_TOKEN, constants_1.ESCAPED_UNREFERENCED_STRING_TOKEN) + constants_1.UNREFERENCED_STRING_TOKEN);
        }
    }
}
exports.compressString = compressString;

},{"../constants":11,"../util":19}],8:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var constants_1 = require("../../constants");
var util_1 = require("../util");
var TemplateObject = /** @class */ (function () {
    /**
     * Create a new template object starting with two initial object that might have a shared structure
     */
    function TemplateObject(a, b) {
        this.isTemplating = false;
        this.struct = [];
        if (a != null && b != null) {
            this.isTemplating = buildTemplate(a, b, this.struct);
        }
    }
    /**
     * Compress template to writer
     */
    TemplateObject.prototype.compressTemplate = function (compressors, context, invertedIndex, writer, options) {
        compresObjectTemplate(compressors, context, invertedIndex, writer, options, this.struct);
    };
    /**
     * Compress object values according to structure to writer
     */
    TemplateObject.prototype.compressTemplateValues = function (compressors, context, invertedIndex, writer, options, obj) {
        compressObjectValues(compressors, context, invertedIndex, writer, options, this.struct, obj);
    };
    /**
     * Determine if object is templateable according to existing structure
     * If not the an ending token will be written to writer
     */
    TemplateObject.prototype.isNextTemplateable = function (obj, writer) {
        this.isTemplating = conformsToStructure(this.struct, obj);
        if (!this.isTemplating) {
            writer.write(constants_1.TEMPLATE_OBJECT_FINAL);
        }
    };
    /**
     * Finalize template object and write ending token
     */
    TemplateObject.prototype.end = function (writer) {
        writer.write(constants_1.TEMPLATE_OBJECT_FINAL);
    };
    return TemplateObject;
}());
exports.TemplateObject = TemplateObject;
/**
 * Build a shared template structure for two objects, returns true if they strictly share a structre
 * or false if not and a shared template structure could not be built
 */
function buildTemplate(a, b, struct, level) {
    if (level === void 0) { level = 0; }
    // Do not check deeper than 6 levels
    if (level > 6) {
        return false;
    }
    var keysA = Object.keys(a);
    var keysB = Object.keys(b);
    // If they do not have the same amount of keys, it is not a shared structure
    if (keysA.length !== keysB.length) {
        return false;
    }
    // Do not try to find a shared structure if there is more than 10 keys for one level
    if (keysA.length > 10) {
        return false;
    }
    // Sort keys to assert structural equality
    keysA.sort(function (a, b) { return a.localeCompare(b); });
    keysB.sort(function (a, b) { return a.localeCompare(b); });
    // Check each key for structural equality
    for (var i = 0; i < keysA.length; i++) {
        var keyA = keysA[i];
        var keyB = keysB[i];
        // If the keys do not share the same identifier, they are not structurally equal
        if (keyA !== keyB) {
            return false;
        }
        var valueA = a[keyA];
        var valueB = b[keyB];
        // Check if the key is an object
        if (util_1.isObject(valueA)) {
            if (!util_1.isObject(valueB)) {
                // If a is an object a b is not, they are not structurally equal
                return false;
            }
            // Create a substructure for nested object
            var nextStruct = [];
            // Add key and substructure to parent structure
            struct.push([keyA, nextStruct]);
            // Check nested objects for structural equality
            if (!buildTemplate(valueA, valueB, nextStruct, level + 1)) {
                return false;
            }
        }
        else if (util_1.isObject(valueB)) {
            // If a is not an object and b is, they are not structurally equal
            return false;
        }
        else {
            struct.push([keyA]);
        }
    }
    // If not on root level or root level is structurally equal objects they are considered structurally equal
    return level > 0 || util_1.isObject(a);
}
/**
 * Check if an object conforms to an existing structure
 */
function conformsToStructure(struct, obj) {
    if (!obj) {
        return false;
    }
    if (Object.keys(obj).length !== struct.length) {
        return false;
    }
    for (var i = 0; i < struct.length; i++) {
        var key = struct[i][0];
        var isNested = struct[i].length > 1;
        if (obj[key] === void 0) {
            return false;
        }
        if (isNested) {
            var x = struct[i];
            var y = x[1];
            if (!conformsToStructure(struct[i][1], obj[key])) {
                return false;
            }
        }
        else {
            if (util_1.isObject(obj[key])) {
                return false;
            }
        }
    }
    return true;
}
/**
 * Compress an object template to writer
 */
function compresObjectTemplate(compressors, context, invertedIndex, writer, options, struct) {
    writer.write(constants_1.TEMPLATE_OBJECT_START);
    for (var i = 0; i < struct.length; i++) {
        var key = struct[i][0];
        var isNested = struct[i].length > 1;
        compressors.string(compressors, context, key, invertedIndex, writer, options);
        if (isNested) {
            compresObjectTemplate(compressors, context, invertedIndex, writer, options, struct[i][1]);
        }
    }
    ;
    writer.write(constants_1.TEMPLATE_OBJECT_END);
}
/**
 * Compress object values according to provided structure to writer
 */
function compressObjectValues(compressors, context, invertedIndex, writer, options, struct, obj) {
    for (var i = 0; i < struct.length; i++) {
        var key = struct[i][0];
        var value = obj[key];
        var isNested = struct[i].length > 1;
        if (isNested) {
            compressObjectValues(compressors, context, invertedIndex, writer, options, struct[i][1], value);
        }
        else {
            compressors.any(compressors, context, value, invertedIndex, writer, options);
        }
    }
    ;
}

},{"../../constants":11,"../util":9}],9:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Determine if obj is an object according to serialization
 */
function isObject(obj) {
    var type = typeof obj;
    if (type === 'number') {
        return false;
    }
    else if (type === 'string') {
        return false;
    }
    else if (type === 'boolean') {
        return false;
    }
    else if (obj === null) {
        return false;
    }
    else if (Array.isArray(obj)) {
        return false;
    }
    else if (obj instanceof Date) {
        return false;
    }
    else if (obj === void 0) {
        return false;
    }
    else {
        return true;
    }
}
exports.isObject = isObject;

},{}],10:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * A zipson writer takes a piece of zipson compression output as a string
 */
var ZipsonWriter = /** @class */ (function () {
    function ZipsonWriter() {
    }
    return ZipsonWriter;
}());
exports.ZipsonWriter = ZipsonWriter;
/**
 * Writes zipson compression outupt in full to a string
 */
var ZipsonStringWriter = /** @class */ (function (_super) {
    __extends(ZipsonStringWriter, _super);
    function ZipsonStringWriter() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.value = '';
        return _this;
    }
    ZipsonStringWriter.prototype.write = function (data) {
        this.value += data;
    };
    ZipsonStringWriter.prototype.end = function () { };
    return ZipsonStringWriter;
}(ZipsonWriter));
exports.ZipsonStringWriter = ZipsonStringWriter;

},{}],11:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Precision constants
 */
exports.FLOAT_COMPRESSION_PRECISION = 1000;
exports.DATE_LOW_PRECISION = 100000;
/**
 * Floating point delimiters
 */
exports.FLOAT_FULL_PRECISION_DELIMITER = ',';
exports.FLOAT_REDUCED_PRECISION_DELIMITER = '.';
/**
 * Data type tokens
 */
exports.INTEGER_TOKEN = '??';
exports.FLOAT_TOKEN = '??';
exports.STRING_TOKEN = '??';
exports.DATE_TOKEN = '??';
exports.LP_DATE_TOKEN = '??';
exports.UNREFERENCED_INTEGER_TOKEN = '??';
exports.UNREFERENCED_FLOAT_TOKEN = '??';
exports.UNREFERENCED_STRING_TOKEN = '??';
exports.UNREFERENCED_DATE_TOKEN = '??';
exports.UNREFERENCED_LP_DATE_TOKEN = '??';
exports.REF_INTEGER_TOKEN = '??';
exports.REF_FLOAT_TOKEN = '??';
exports.REF_STRING_TOKEN = '??';
exports.REF_DATE_TOKEN = '??';
exports.REF_LP_DATE_TOKEN = '??';
exports.NULL_TOKEN = '??';
exports.UNDEFINED_TOKEN = '??';
exports.BOOLEAN_TRUE_TOKEN = '??';
exports.BOOLEAN_FALSE_TOKEN = '??';
/**
 * String escape tokens
 */
exports.ESCAPE_CHARACTER = '\\';
exports.ESCAPED_STRING_TOKEN = "" + exports.ESCAPE_CHARACTER + exports.STRING_TOKEN;
exports.ESCAPED_UNREFERENCED_STRING_TOKEN = "" + exports.ESCAPE_CHARACTER + exports.UNREFERENCED_STRING_TOKEN;
/**
 * Regex lookups
 */
exports.REGEX_ESCAPE_CHARACTER = new RegExp(exports.ESCAPE_CHARACTER.replace("\\", "\\\\"), 'g');
exports.REGEX_ESCAPED_ESCAPE_CHARACTER = new RegExp(exports.ESCAPE_CHARACTER.replace("\\", "\\\\") + exports.ESCAPE_CHARACTER.replace("\\", "\\\\"), 'g');
exports.REGEX_STRING_TOKEN = new RegExp(exports.STRING_TOKEN, 'g');
exports.REGEX_ESCAPED_STRING_TOKEN = new RegExp(exports.ESCAPE_CHARACTER + exports.ESCAPED_STRING_TOKEN, 'g');
exports.REGEX_UNREFERENCED_STRING_TOKEN = new RegExp(exports.UNREFERENCED_STRING_TOKEN, 'g');
exports.REGEX_UNREFERENCED_ESCAPED_STRING_TOKEN = new RegExp(exports.ESCAPE_CHARACTER + exports.ESCAPED_UNREFERENCED_STRING_TOKEN, 'g');
exports.DATE_REGEX = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/;
/**
 * Structural tokens
 */
exports.OBJECT_START_TOKEN = '{';
exports.OBJECT_END_TOKEN = '}';
exports.TEMPLATE_OBJECT_START = '??';
exports.TEMPLATE_OBJECT_END = '???';
exports.TEMPLATE_OBJECT_FINAL = '???';
exports.ARRAY_START_TOKEN = '|';
exports.ARRAY_END_TOKEN = '??';
exports.ARRAY_REPEAT_TOKEN = '??';
exports.ARRAY_REPEAT_MANY_TOKEN = '^';
exports.ARRAY_REPEAT_COUNT_THRESHOLD = 4;
/**
 * General tokenization constants
 */
exports.REFERENCE_HEADER_LENGTH = 1;
exports.DELIMITING_TOKENS_THRESHOLD = 122;
exports.STRING_IDENT_PREFIX = '$';
/**
 * Small integer tokens
 */
exports.INTEGER_SMALL_EXCLUSIVE_BOUND_LOWER = -10;
exports.INTEGER_SMALL_EXCLUSIVE_BOUND_UPPER = 10;
exports.INTEGER_SMALL_TOKEN_EXCLUSIVE_BOUND_LOWER = 191;
exports.INTEGER_SMALL_TOKEN_EXCLUSIVE_BOUND_UPPER = 211;
exports.INTEGER_SMALL_TOKEN_OFFSET = -201;
exports.INTEGER_SMALL_TOKEN_ELEMENT_OFFSET = 9;
exports.INTEGER_SMALL_TOKENS = ['??', '??', '??', '??', '??', '??', '??', '??', '??', '??', '??', '??', '??', '??', '??', '??', '??', '??', '??'];

},{}],12:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var common_1 = require("./decompressor/common");
var stages_1 = require("./decompressor/stages");
/**
 * Create an ordered index for decompression
 */
function makeOrderedIndex() {
    return {
        strings: [],
        integers: [],
        floats: [],
        dates: [],
        lpDates: [],
    };
}
exports.makeOrderedIndex = makeOrderedIndex;
/**
 * Create a new cursor with a root target for specified drain mode
 */
function makeCursor(drain) {
    var rootTarget = { type: common_1.TargetType.SCALAR, value: void 0 };
    var stack = new Array(10);
    stack[0] = rootTarget;
    return { index: 0, rootTarget: rootTarget, stack: stack, currentTarget: rootTarget, pointer: 0, drain: drain };
}
/**
 * Decompress data string with provided ordered index
 */
function decompress(data, orderedIndex) {
    var cursor = makeCursor(true);
    stages_1.decompressStages(cursor, data, orderedIndex);
    return cursor.rootTarget.value;
}
exports.decompress = decompress;
/**
 * Decompress zipson data incrementally by providing each chunk of data in sequence
 */
function decompressIncremental(orderedIndex) {
    var cursor = makeCursor(false);
    // Keep an internal buffer for any unterminated chunks of data
    var buffer = '';
    function increment(data) {
        if (data === null) {
            // Move cursor to drain mode if we got the last chunk of data
            cursor.drain = true;
        }
        else if (data.length === 0) {
            return;
        }
        else {
            buffer += data;
        }
        // Decompress an determine amount of buffer that was parsed
        var cursorIndexBefore = cursor.index;
        stages_1.decompressStages(cursor, buffer, orderedIndex);
        var movedAmount = cursor.index - cursorIndexBefore;
        // Rotate parsed data out of buffer and move cursor back to next parsing position
        if (movedAmount > 0) {
            buffer = buffer.substring(movedAmount);
            cursor.index -= movedAmount;
        }
    }
    return { increment: increment, cursor: cursor };
}
exports.decompressIncremental = decompressIncremental;

},{"./decompressor/common":13,"./decompressor/stages":16}],13:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SKIP_SCALAR = {};
/**
 * Target type differentiators
 */
var TargetType;
(function (TargetType) {
    TargetType["ARRAY"] = "ARRAY";
    TargetType["OBJECT"] = "OBJECT";
    TargetType["SCALAR"] = "SCALAR";
    TargetType["TEMPLATE_OBJECT"] = "TEMPLATE_OBJECT";
    TargetType["TEMPLATE_OBJECT_PROPERTIES"] = "TEMPLATE_OBJECT_PROPERTIES";
    TargetType["TEMPLATE_OBJECT_ELEMENTS"] = "TEMPLATE_OBJECT_ELEMENTS";
})(TargetType = exports.TargetType || (exports.TargetType = {}));

},{}],14:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var constants_1 = require("../constants");
var common_1 = require("./common");
var scalar_1 = require("./scalar");
var template_1 = require("./template");
function decompressElement(c, cursor, data, orderedIndex) {
    var targetValue;
    if (c === constants_1.ARRAY_END_TOKEN || c === constants_1.OBJECT_END_TOKEN) {
        targetValue = cursor.currentTarget.value;
        cursor.currentTarget = cursor.stack[cursor.pointer - 1];
        cursor.pointer--;
    }
    else {
        targetValue = scalar_1.decompressScalar(c, data, cursor, orderedIndex);
        if (targetValue === common_1.SKIP_SCALAR) {
            return false;
        }
    }
    if (cursor.currentTarget.type === common_1.TargetType.SCALAR) {
        cursor.currentTarget.value = targetValue;
    }
    else if (cursor.currentTarget.type === common_1.TargetType.ARRAY) {
        cursor.currentTarget.value[cursor.currentTarget.value.length] = targetValue;
    }
    else if (cursor.currentTarget.type === common_1.TargetType.OBJECT) {
        if (cursor.currentTarget.key != null) {
            cursor.currentTarget.value[cursor.currentTarget.key] = targetValue;
            cursor.currentTarget.key = void 0;
        }
        else {
            cursor.currentTarget.key = targetValue;
        }
    }
    else if (cursor.currentTarget.type === common_1.TargetType.TEMPLATE_OBJECT) {
        cursor.currentTarget.currentToken = targetValue;
        cursor.currentTarget.currentTokens.push(targetValue);
    }
    else if (cursor.currentTarget.type === common_1.TargetType.TEMPLATE_OBJECT_PROPERTIES) {
        template_1.appendTemplateObjectPropertiesValue(cursor.currentTarget, targetValue);
    }
    else if (cursor.currentTarget.type === common_1.TargetType.TEMPLATE_OBJECT_ELEMENTS) {
        template_1.appendTemplateObjectElementsValue(cursor.currentTarget, targetValue);
    }
    return true;
}
exports.decompressElement = decompressElement;

},{"../constants":11,"./common":13,"./scalar":15,"./template":17}],15:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var constants_1 = require("../constants");
var common_1 = require("./common");
var util_1 = require("../util");
function decompressScalar(token, data, cursor, orderedIndex) {
    var startIndex = cursor.index;
    var endIndex = cursor.index + 1;
    // Find end index of token value
    var foundStringToken;
    if (((token === constants_1.STRING_TOKEN) && (foundStringToken = constants_1.STRING_TOKEN))
        || ((token === constants_1.UNREFERENCED_STRING_TOKEN) && (foundStringToken = constants_1.UNREFERENCED_STRING_TOKEN))) {
        var escaped = true;
        while (escaped && endIndex < data.length) {
            endIndex = data.indexOf(foundStringToken, endIndex);
            var iNumEscapeCharacters = 1;
            escaped = false;
            while (data[endIndex - iNumEscapeCharacters] === constants_1.ESCAPE_CHARACTER) {
                escaped = iNumEscapeCharacters % 2 === 1;
                iNumEscapeCharacters++;
            }
            endIndex++;
        }
        if (endIndex <= startIndex) {
            endIndex = data.length;
        }
    }
    else {
        while (!(data.charCodeAt(endIndex) > constants_1.DELIMITING_TOKENS_THRESHOLD) && endIndex < data.length) {
            endIndex++;
        }
    }
    if (!cursor.drain && endIndex === data.length) {
        return common_1.SKIP_SCALAR;
    }
    // Update cursor end index
    cursor.index = endIndex - 1;
    var tokenCharCode = token.charCodeAt(0);
    // Decompress the token value
    if (tokenCharCode > constants_1.INTEGER_SMALL_TOKEN_EXCLUSIVE_BOUND_LOWER && tokenCharCode < constants_1.INTEGER_SMALL_TOKEN_EXCLUSIVE_BOUND_UPPER) {
        return tokenCharCode + constants_1.INTEGER_SMALL_TOKEN_OFFSET;
    }
    else if (token === constants_1.ARRAY_REPEAT_MANY_TOKEN) {
        return util_1.decompressInteger(data.substring(startIndex + 1, endIndex));
    }
    else if (token === constants_1.REF_STRING_TOKEN) {
        return orderedIndex.strings[util_1.decompressInteger(data.substring(startIndex + 1, endIndex))];
    }
    else if (token === constants_1.REF_INTEGER_TOKEN) {
        return orderedIndex.integers[util_1.decompressInteger(data.substring(startIndex + 1, endIndex))];
    }
    else if (token === constants_1.REF_FLOAT_TOKEN) {
        return orderedIndex.floats[util_1.decompressInteger(data.substring(startIndex + 1, endIndex))];
    }
    else if (token === constants_1.REF_DATE_TOKEN) {
        return orderedIndex.dates[util_1.decompressInteger(data.substring(startIndex + 1, endIndex))];
    }
    else if (token === constants_1.REF_LP_DATE_TOKEN) {
        return orderedIndex.lpDates[util_1.decompressInteger(data.substring(startIndex + 1, endIndex))];
    }
    else if (token === constants_1.STRING_TOKEN) {
        return orderedIndex.strings[orderedIndex.strings.length] = data.substring(startIndex + 1, endIndex - 1).replace(constants_1.REGEX_ESCAPED_ESCAPE_CHARACTER, constants_1.ESCAPE_CHARACTER).replace(constants_1.REGEX_ESCAPED_STRING_TOKEN, constants_1.STRING_TOKEN);
    }
    else if (token === constants_1.INTEGER_TOKEN) {
        return orderedIndex.integers[orderedIndex.integers.length] = util_1.decompressInteger(data.substring(startIndex + 1, endIndex));
    }
    else if (token === constants_1.FLOAT_TOKEN) {
        return orderedIndex.floats[orderedIndex.floats.length] = util_1.decompressFloat(data.substring(startIndex + 1, endIndex));
    }
    else if (token === constants_1.DATE_TOKEN) {
        return orderedIndex.dates[orderedIndex.dates.length] = new Date(util_1.decompressInteger(data.substring(startIndex + 1, endIndex))).toISOString();
    }
    else if (token === constants_1.LP_DATE_TOKEN) {
        return orderedIndex.lpDates[orderedIndex.lpDates.length] = new Date(constants_1.DATE_LOW_PRECISION * util_1.decompressInteger(data.substring(startIndex + 1, endIndex))).toISOString();
    }
    else if (token === constants_1.UNREFERENCED_STRING_TOKEN) {
        return data.substring(startIndex + 1, endIndex - 1).replace(constants_1.REGEX_ESCAPED_ESCAPE_CHARACTER, constants_1.ESCAPE_CHARACTER).replace(constants_1.REGEX_UNREFERENCED_ESCAPED_STRING_TOKEN, constants_1.UNREFERENCED_STRING_TOKEN);
    }
    else if (token === constants_1.UNREFERENCED_INTEGER_TOKEN) {
        return util_1.decompressInteger(data.substring(startIndex + 1, endIndex));
    }
    else if (token === constants_1.UNREFERENCED_FLOAT_TOKEN) {
        return util_1.decompressFloat(data.substring(startIndex + 1, endIndex));
    }
    else if (token === constants_1.UNREFERENCED_DATE_TOKEN) {
        return new Date(util_1.decompressInteger(data.substring(startIndex + 1, endIndex))).toISOString();
    }
    else if (token === constants_1.UNREFERENCED_LP_DATE_TOKEN) {
        return new Date(constants_1.DATE_LOW_PRECISION * util_1.decompressInteger(data.substring(startIndex + 1, endIndex))).toISOString();
    }
    else if (token === constants_1.BOOLEAN_TRUE_TOKEN) {
        return true;
    }
    else if (token === constants_1.BOOLEAN_FALSE_TOKEN) {
        return false;
    }
    else if (token === constants_1.NULL_TOKEN) {
        return null;
    }
    else if (token === constants_1.UNDEFINED_TOKEN) {
        return undefined;
    }
    throw new Error("Unexpected scalar " + token + " at " + startIndex + "-" + endIndex);
}
exports.decompressScalar = decompressScalar;

},{"../constants":11,"../util":19,"./common":13}],16:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var constants_1 = require("../constants");
var common_1 = require("./common");
var scalar_1 = require("./scalar");
var element_1 = require("./element");
function decompressStages(cursor, data, orderedIndex) {
    for (; cursor.index < data.length; cursor.index++) {
        var c = data[cursor.index];
        if (c === constants_1.ARRAY_START_TOKEN) {
            cursor.currentTarget = { type: common_1.TargetType.ARRAY, value: [] };
            cursor.stack[++cursor.pointer] = cursor.currentTarget;
        }
        else if (c === constants_1.OBJECT_START_TOKEN) {
            cursor.currentTarget = { type: common_1.TargetType.OBJECT, value: {} };
            cursor.stack[++cursor.pointer] = cursor.currentTarget;
        }
        else if (c === constants_1.ARRAY_REPEAT_TOKEN && (cursor.currentTarget.type === common_1.TargetType.ARRAY || cursor.currentTarget.type === common_1.TargetType.TEMPLATE_OBJECT_ELEMENTS)) {
            var repeatedItem = cursor.currentTarget.value[cursor.currentTarget.value.length - 1];
            cursor.currentTarget.value.push(repeatedItem);
        }
        else if (c === constants_1.ARRAY_REPEAT_MANY_TOKEN && (cursor.currentTarget.type === common_1.TargetType.ARRAY || cursor.currentTarget.type === common_1.TargetType.TEMPLATE_OBJECT_ELEMENTS)) {
            var repeatCount = scalar_1.decompressScalar(data[cursor.index], data, cursor, orderedIndex);
            if (repeatCount === common_1.SKIP_SCALAR) {
                return;
            }
            var repeatedItem = cursor.currentTarget.value[cursor.currentTarget.value.length - 1];
            for (var i = 0; i < repeatCount; i++) {
                cursor.currentTarget.value.push(repeatedItem);
            }
        }
        else if (c === constants_1.TEMPLATE_OBJECT_START && (cursor.currentTarget.type === common_1.TargetType.TEMPLATE_OBJECT || cursor.currentTarget.type === common_1.TargetType.OBJECT || cursor.currentTarget.type === common_1.TargetType.ARRAY)) {
            if (cursor.currentTarget.type !== common_1.TargetType.TEMPLATE_OBJECT) {
                var parentTarget = cursor.currentTarget;
                cursor.currentTarget = { type: common_1.TargetType.TEMPLATE_OBJECT, value: void 0, currentTokens: [], currentRoute: [], paths: [], level: 0, parentTarget: parentTarget };
                cursor.stack[++cursor.pointer] = cursor.currentTarget;
            }
            else {
                // Add any found tokens prior to next nested as separate paths
                for (var i = 0; i < cursor.currentTarget.currentTokens.length - 1; i++) {
                    var currentToken = cursor.currentTarget.currentTokens[i];
                    cursor.currentTarget.paths[cursor.currentTarget.paths.length] = cursor.currentTarget.currentRoute.concat(currentToken);
                }
                // Add most recent token as part of next path
                if (cursor.currentTarget.currentToken != null) {
                    cursor.currentTarget.currentRoute.push(cursor.currentTarget.currentToken);
                }
                // Clear tokens for nested object
                cursor.currentTarget.currentTokens = [];
                cursor.currentTarget.level++;
            }
        }
        else if (c === constants_1.TEMPLATE_OBJECT_END && cursor.currentTarget.type === common_1.TargetType.TEMPLATE_OBJECT) {
            for (var i = 0; i < cursor.currentTarget.currentTokens.length; i++) {
                var currentToken = cursor.currentTarget.currentTokens[i];
                cursor.currentTarget.paths[cursor.currentTarget.paths.length] = cursor.currentTarget.currentRoute.concat(currentToken);
            }
            cursor.currentTarget.currentTokens = [];
            cursor.currentTarget.currentRoute = cursor.currentTarget.currentRoute.slice(0, -1);
            cursor.currentTarget.level--;
            if (cursor.currentTarget.level < 0) {
                var paths = cursor.currentTarget.paths;
                var parentTarget = cursor.currentTarget.parentTarget;
                cursor.pointer--;
                if (parentTarget.type === common_1.TargetType.ARRAY) {
                    cursor.currentTarget = { type: common_1.TargetType.TEMPLATE_OBJECT_ELEMENTS, value: parentTarget.value, paths: paths, currentPathIndex: 0, expectedPaths: paths.length, currentObject: {} };
                }
                else if (parentTarget.type === common_1.TargetType.OBJECT) {
                    cursor.currentTarget = { type: common_1.TargetType.TEMPLATE_OBJECT_PROPERTIES, value: parentTarget.value, paths: paths, currentPathIndex: -1, expectedPaths: paths.length, currentObject: {} };
                }
                cursor.stack[++cursor.pointer] = cursor.currentTarget;
            }
        }
        else if (c === constants_1.TEMPLATE_OBJECT_FINAL) {
            cursor.currentTarget = cursor.stack[--cursor.pointer];
        }
        else {
            if (!element_1.decompressElement(c, cursor, data, orderedIndex)) {
                return;
            }
        }
    }
}
exports.decompressStages = decompressStages;

},{"../constants":11,"./common":13,"./element":14,"./scalar":15}],17:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function appendTemplateObjectValue(templateObjectTarget, targetValue) {
    var currentPath = templateObjectTarget.paths[templateObjectTarget.currentPathIndex];
    var i = 0;
    var targetObject = templateObjectTarget.currentObject;
    for (; i < currentPath.length - 1; i++) {
        var fragment = currentPath[i];
        targetObject = targetObject[fragment] = targetObject[fragment] || {};
    }
    // Undefined values are tokenized for templated object in order to keep field order
    // so we filter them in parsing to avoid including them in parsed result
    if (targetValue !== void 0) {
        targetObject[currentPath[i]] = targetValue;
    }
}
/**
 * Append a parsed value to template object by properties
 */
function appendTemplateObjectPropertiesValue(templateObjectElementsTarget, targetValue) {
    // If we have a negative path index that is the root identifier for a new object
    if (templateObjectElementsTarget.currentPathIndex === -1) {
        templateObjectElementsTarget.value[targetValue] = templateObjectElementsTarget.currentObject = {};
    }
    else {
        appendTemplateObjectValue(templateObjectElementsTarget, targetValue);
    }
    // If we got all path values, rotate to negative 1 for the next object
    if (++templateObjectElementsTarget.currentPathIndex === templateObjectElementsTarget.expectedPaths) {
        templateObjectElementsTarget.currentPathIndex = -1;
    }
}
exports.appendTemplateObjectPropertiesValue = appendTemplateObjectPropertiesValue;
/**
 * Append a parsed value to template object by elements
 */
function appendTemplateObjectElementsValue(templateObjectPropertiesTarget, targetValue) {
    // If we have the first path value create a new element
    if (templateObjectPropertiesTarget.currentPathIndex === 0) {
        templateObjectPropertiesTarget.currentObject = {};
        templateObjectPropertiesTarget.value.push(templateObjectPropertiesTarget.currentObject);
    }
    appendTemplateObjectValue(templateObjectPropertiesTarget, targetValue);
    // If we got all path values, rotate to 0 for the next element
    if (++templateObjectPropertiesTarget.currentPathIndex === templateObjectPropertiesTarget.expectedPaths) {
        templateObjectPropertiesTarget.currentPathIndex = 0;
    }
}
exports.appendTemplateObjectElementsValue = appendTemplateObjectElementsValue;

},{}],18:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
var compress_1 = require("./compress");
var writer_1 = require("./compressor/writer");
var decompress_1 = require("./decompress");
__export(require("./compressor/writer"));
__export(require("./decompressor/common"));
/**
 * Parse a zipson data string
 */
function parse(data) {
    var orderedIndex = decompress_1.makeOrderedIndex();
    return decompress_1.decompress(data, orderedIndex);
}
exports.parse = parse;
/**
 * Incrementally parse a zipson data string in chunks
 */
function parseIncremental() {
    var orderedIndex = decompress_1.makeOrderedIndex();
    var _a = decompress_1.decompressIncremental(orderedIndex), cursor = _a.cursor, increment = _a.increment;
    return function (data) {
        increment(data);
        if (data === null) {
            return cursor.rootTarget.value;
        }
    };
}
exports.parseIncremental = parseIncremental;
/**
 * Stringify any data to a zipson writer
 */
function stringifyTo(data, writer, options) {
    if (options === void 0) { options = {}; }
    var invertedIndex = compress_1.makeInvertedIndex();
    var context = compress_1.makeCompressContext();
    compress_1.compress(context, data, invertedIndex, writer, options);
    writer.end();
}
exports.stringifyTo = stringifyTo;
/**
 * Stringify any data to a string
 */
function stringify(data, options) {
    var writer = new writer_1.ZipsonStringWriter();
    stringifyTo(data, writer, options);
    return writer.value;
}
exports.stringify = stringify;

},{"./compress":1,"./compressor/writer":10,"./decompress":12,"./decompressor/common":13}],19:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var constants_1 = require("./constants");
var maxInteger = 2147483648;
var minInteger = -2147483649;
var base62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/**
 * Convert number to base62 string
 */
function compressInteger(number) {
    if (number === 0) {
        return '0';
    }
    var result = '';
    var carry = number < 0 ? -number : number;
    var current = 0;
    var fraction;
    while (carry > 0) {
        carry = carry / 62;
        fraction = carry % 1;
        current = ((fraction * 62) + 0.1) << 0;
        carry -= fraction;
        result = base62[current] + result;
    }
    result = number < 0 ? '-' + result : result;
    return result;
}
exports.compressInteger = compressInteger;
/**
 * Convert base62 string to number
 */
function decompressInteger(compressedInteger) {
    var value = 0;
    if (compressedInteger[0] === '0') {
        return value;
    }
    else {
        var negative = compressedInteger[0] === '-';
        var multiplier = 1;
        var leftBound = negative ? 1 : 0;
        for (var i = compressedInteger.length - 1; i >= leftBound; i--) {
            var code = compressedInteger.charCodeAt(i);
            var current = code - 48;
            if (code >= 97) {
                current -= 13;
            }
            else if (code >= 65) {
                current -= 7;
            }
            value += current * multiplier;
            multiplier *= 62;
        }
        return negative ? -value : value;
    }
}
exports.decompressInteger = decompressInteger;
/**
 * Convert float to base62 string for integer and fraction
 */
function compressFloat(float, fullPrecision) {
    if (fullPrecision === void 0) { fullPrecision = false; }
    if (fullPrecision) {
        var _a = float.toString().split('.'), integer = _a[0], fraction = _a[1];
        var operator = integer === '-0' ? '-' : '';
        return "" + operator + compressInteger(parseInt(integer)) + constants_1.FLOAT_FULL_PRECISION_DELIMITER + fraction;
    }
    else {
        var integer = float >= maxInteger ? Math.floor(float) : float <= minInteger ? Math.ceil(float) : float << 0;
        var fraction = Math.round((constants_1.FLOAT_COMPRESSION_PRECISION * (float % 1)));
        return "" + compressInteger(integer) + constants_1.FLOAT_REDUCED_PRECISION_DELIMITER + compressInteger(fraction);
    }
}
exports.compressFloat = compressFloat;
/**
 * Convert base62 integer and fraction to float
 */
function decompressFloat(compressedFloat) {
    if (compressedFloat.indexOf(constants_1.FLOAT_FULL_PRECISION_DELIMITER) > -1) {
        var _a = compressedFloat.split(constants_1.FLOAT_FULL_PRECISION_DELIMITER), integer = _a[0], fraction = _a[1];
        var mult = integer === '-0' ? -1 : 1;
        var uncompressedInteger = decompressInteger(integer);
        return mult * parseFloat(uncompressedInteger + '.' + fraction);
    }
    else {
        var _b = compressedFloat.split(constants_1.FLOAT_REDUCED_PRECISION_DELIMITER), integer = _b[0], fraction = _b[1];
        var uncompressedInteger = decompressInteger(integer);
        var uncompressedFraction = decompressInteger(fraction);
        return uncompressedInteger + uncompressedFraction / constants_1.FLOAT_COMPRESSION_PRECISION;
    }
}
exports.decompressFloat = decompressFloat;

},{"./constants":11}]},{},[18])(18)
});

window.Zipson = module.exports;
