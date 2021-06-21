const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/lib/sync');
const { default: ow } = require('ow');
const HeaderGenerator = require('header-generator');

const { BayesianNetwork } = require("generative-bayesian-network");

const fingerprintNetworkDefinition = require('./data_files/fingerprint-network-definition.json');

const STRINGIFIED_PREFIX = '*STRINGIFIED*';
const MISSING_VALUE_DATASET_TOKEN = '*MISSING_VALUE*';

function getRandomInteger(minimum, maximum) {
    return minimum + Math.floor(Math.random() * (maximum - minimum + 1));
}

const browserSpecificationShape = {
    name: ow.string,
    minVersion: ow.optional.number,
    maxVersion: ow.optional.number,
    httpVersion: ow.optional.string,
};

const headerGeneratorOptionsShape = {
    browsers: ow.optional.array.ofType(ow.any(ow.object.exactShape(browserSpecificationShape), ow.string)),
    operatingSystems: ow.optional.array.ofType(ow.string),
    devices: ow.optional.array.ofType(ow.string),
    locales: ow.optional.array.ofType(ow.string),
    httpVersion: ow.optional.string,
};

/**
 * @typedef BrowserSpecification
 * @param {string} name - One of `chrome`, `firefox` and `safari`.
 * @param {number} minVersion - Minimal version of browser used.
 * @param {number} maxVersion - Maximal version of browser used.
 * @param {string} httpVersion - Http version to be used to generate headers (the headers differ depending on the version).
 *  Either 1 or 2. If none specified the httpVersion specified in `HeaderGeneratorOptions` is used.
 */
/**
 * @typedef HeaderGeneratorOptions
 * @param {Array<BrowserSpecification|string>} browsers - List of BrowserSpecifications to generate the headers for,
 *  or one of `chrome`, `firefox` and `safari`.
 * @param {Array<string>} operatingSystems - List of operating systems to generate the headers for.
 *  The options are `windows`, `macos`, `linux`, `android` and `ios`.
 * @param {Array<string>} devices - List of devices to generate the headers for. Options are `desktop` and `mobile`.
 * @param {Array<string>} locales - List of at most 10 languages to include in the
 *  [Accept-Language](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Language) request header
 *  in the language format accepted by that header, for example `en`, `en-US` or `de`.
 * @param {string} httpVersion - Http version to be used to generate headers (the headers differ depending on the version).
 *  Can be either 1 or 2. Default value is 2.
 */

/**
 * Fingerprint generator - randomly generates realistic browser fingerprints
 */
class FingerprintGenerator {

    /**
     * @param {HeaderGeneratorOptions} options - default header generation options used unless overridden
     */
    constructor(options = {}) {
        ow(options, 'HeaderGeneratorOptions', ow.object.exactShape(headerGeneratorOptionsShape));
        this.headerGenerator = new HeaderGenerator(options);
        this.fingerprintGeneratorNetwork = new BayesianNetwork(fingerprintNetworkDefinition);
    }

    /**
     * @param {HeaderGeneratorOptions} options - specifies options that should be overridden for this one call
     * @param {Object} requestDependentHeaders - specifies known values of headers dependent on the particular request
     */
    getFingerprint(options = {}, requestDependentHeaders = {}) {
        ow(options, 'HeaderGeneratorOptions', ow.object.exactShape(headerGeneratorOptionsShape));
        const headers = this.headerGenerator.getHeaders(options, requestDependentHeaders);
        const userAgent = "User-Agent" in headers ? headers["User-Agent"] : headers["user-agent"];

        let fingerprint = this.fingerprintGeneratorNetwork.generateSample({
            "userAgent": userAgent
        });

        for(const attribute in fingerprint) {
            if(fingerprint[attribute] == MISSING_VALUE_DATASET_TOKEN) {
                delete fingerprint[attribute];
            } else if(fingerprint[attribute].startsWith(STRINGIFIED_PREFIX)) {
                fingerprint[attribute] = JSON.parse(fingerprint[attribute].slice(STRINGIFIED_PREFIX.length));
            }
        }

        if("pluginCharacteristics" in fingerprint) {
            for(const attribute in fingerprint["pluginCharacteristics"]) {
                fingerprint[attribute] = fingerprint["pluginCharacteristics"][attribute];
            }
            delete fingerprint["pluginCharacteristics"];
        }

        if("screenCharacteristics" in fingerprint) {
            for(const attribute in fingerprint["screenCharacteristics"]) {
                fingerprint[attribute] = fingerprint["screenCharacteristics"][attribute];
            }
            delete fingerprint["screenCharacteristics"];
        }

        let acceptLanguageHeaderValue = "Accept-Language" in headers ? headers["Accept-Language"] : headers["accept-language"];
        let acceptedLanguages = [];
        for(const locale of acceptLanguageHeaderValue.split(",")) {
            acceptedLanguages.push(locale.split(";")[0]);
        }
        fingerprint["languages"] = acceptedLanguages;

        return {
            fingerprint,
            headers
        };
    }
}

module.exports = FingerprintGenerator;
