const got = require( 'got' );

const cache = require( './cache.js' );

class Load {
    async loadFromUrl ( url ) {
        const response = await got( url );

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
