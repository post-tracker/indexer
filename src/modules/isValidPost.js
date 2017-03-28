const isValidPost = function isValidPost ( postData, filterData ) {
    if ( postData.content.length <= 0 ) {
        return false;
    }

    if ( !postData.timestamp || String( postData.timestamp ).length !== 10 ) {
        return false;
    }

    // Filter for specific forums if we want
    if ( filterData && filterData.matchOnly ) {
        if ( !Array.isArray( filterData.matchOnly ) ) {
            filterData.matchOnly = [ filterData.matchOnly ];
        }

        if ( filterData.matchOnly.indexOf( postData.section ) === -1 ) {
            return false;
        }
    }

    // Filter for specific forums if we want
    if ( filterData && filterData.exclude ) {
        if ( !Array.isArray( filterData.exclude ) ) {
            filterData.exclude = [ filterData.exclude ];
        }

        if ( filterData.exclude.indexOf( postData.section ) > -1  ) {
            return false;
        }
    }

    return true;
};

module.exports = isValidPost;
