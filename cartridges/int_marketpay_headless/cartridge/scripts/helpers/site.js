'use strict';

const Site = require('dw/system/Site');

/**
 * Retrieves a site custom preference value by ID.
 *
 * @param {string} preferenceID - The ID of the site custom preference.
 * @returns {*} The preference value, or null if the ID is empty.
 */
function getCustomPreference(preferenceID) {
    if (empty(preferenceID)) {
        return null;
    }

    return Site.getCurrent().getCustomPreferenceValue(preferenceID);
}

module.exports = {
    getCustomPreference
};
