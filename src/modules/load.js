const got = require( 'got' );

const cache = require( './cache.js' );

class Load {
    async loadFromUrl ( url ) {
        let response = false;

        try {
            response = await got( url );
        } catch ( urlLoadError ) {
            console.log( `${ url } returned ${ urlLoadError.statusCode }` );

            return false;
        }

        await cache.store( url, response.body );

        return response.body;
    }

    async loadFromCache ( url ) {
        return await cache.get( url );
    }

    async get ( url ) {
        let source = 'cache';

        let urlJSONData = await this.loadFromCache( url );

        if ( !urlJSONData ) {
            // console.log( `Couldn't find ${ url } in cache, loading from web` );
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
            await cache.cleanIndex( url );

            return false;
        }
    }
}

module.exports = new Load();
