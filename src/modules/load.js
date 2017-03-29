const querystring = require( 'querystring' );
const got = require( 'got' );

const cache = require( './cache.js' );

class Load {
    async loadFromUrl ( url ) {
        let response = false;
        const cacheKey = this.getCacheKey( url );

        try {
            response = await got( url );
        } catch ( urlLoadError ) {
            console.log( `${ url } returned ${ urlLoadError.statusCode }` );

            return false;
        }

        await cache.store( cacheKey, response.body );

        return response.body;
    }

    async loadFromCache ( key ) {
        return await cache.get( key );
    }

    getCacheKey ( url, options ) {
        let cacheKey = '';

        if ( options && options.namespace ) {
            cacheKey = `${ cacheKey }${ options.namespace }`;
        }

        cacheKey = `${ cacheKey }${ url }`;

        if ( options && options.parameters ) {
            cacheKey = `${ cacheKey }${ querystring.stringify( options.parameters ) }`;
        }

        return cacheKey;
    }

    async get ( url, options ) {
        let source = 'cache';
        const cacheKey = this.getCacheKey( url, options );

        let urlJSONData = await this.loadFromCache( cacheKey );

        if ( !urlJSONData ) {
            // console.log( `Couldn't find ${ cacheKey } in cache, loading from external source` );
            source = 'web';

            urlJSONData = await this.loadFromUrl( url );
        }

        // Early return if we don't have data because false is valid JSON
        if ( urlJSONData === false ) {
            return false;
        }

        try {
            return JSON.parse( urlJSONData );
        } catch ( parseError ) {
            console.log( `Failed to parse ${ url } from ${ source }.` );
            await cache.cleanIndex( cacheKey );

            return false;
        }
    }
}

module.exports = new Load();
