const request = require( 'request-promise' );

const cache = require( './cache.js' );

class Load {
    async loadFromUrl( url ) {
        const options = {
            uri: url,
            headers: {
                'User-Agent': 'Request-Promise'
            },
            simple: false,
            resolveWithFullResponse: true
        };

        const response = await request.get( options );

        if( response.statusCode !== 200 ){
            console.error( `${ url } returned ${ response.statusCode }` );

            return false;
        }

        await cache.store( url, response.body );

        return response.body;
    }

    async loadFromCache( url ){
        return await cache.get( url );
    }

    async get( url ) {
        let source = 'cache';

        let data = await this.loadFromCache( url );

        if( !data ){
            // console.log( `Couldn't find ${ url } in cache, loading from web` );
            source = 'web';
            data = await this.loadFromUrl( url );
        }

        try {
            return JSON.parse( data );
        } catch( parseError ){
            console.log( `Failed to parse ${ url } from ${ source }. `);
            await cache.cleanIndex( url );

            return false;
        }
    }
}

module.exports = new Load();
