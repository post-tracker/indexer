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

    async get ( url, type = 'json' ) {
        let source = 'cache';

        let urlData = await this.loadFromCache( url );

        if ( !urlData ) {
            // console.log( `Couldn't find ${ url } in cache, loading from web` );
            source = 'web';

            urlData = await this.loadFromUrl( url );
        }

        // Early return if we don't have data because false is valid JSON
        if ( urlData === false ) {
            return false;
        }

        if ( type === 'json' ) {
            try {
                return JSON.parse( urlData );
            } catch ( parseError ) {
                console.log( `Failed to parse ${ url } from ${ source }.` );
                await cache.cleanIndex( url );

                return false;
            }
        }

        return urlData;
    }
}

module.exports = new Load();
