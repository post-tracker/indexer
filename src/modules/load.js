const got = require( 'got' );
const isJSON = require( 'is-json' );

const cache = require( './cache.js' );

class Load {
    async loadFromUrl ( url ) {
        let response = false;
        let type = 'HTML';

        try {
            response = await got( url,
                {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36',
                }
            );
        } catch ( urlLoadError ) {
            console.log( `${ url } returned ${ urlLoadError.statusCode }` );

            return false;
        }

        await cache.store( url, response.body );

        if ( isJSON( response.body ) ) {
            type = 'JSON';
        }

        return {
            dataset: response.body,
            type: type,
        };
    }

    async loadFromCache ( url ) {
        const cacheData = await cache.get( url );
        let type = 'HTML';

        if ( cacheData === false ) {
            return false;
        }

        if ( isJSON( cacheData ) ) {
            type = 'JSON';
        }

        return {
            dataset: cacheData,
            type: type,
        };
    }

    async get ( url ) {
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

        if ( urlData.type === 'JSON' ) {
            try {
                return JSON.parse( urlData );
            } catch ( parseError ) {
                console.log( `Failed to parse ${ url } from ${ source }.` );
                await cache.cleanIndex( url );

                return false;
            }
        }

        return urlData.dataset;
    }
}

module.exports = new Load();
