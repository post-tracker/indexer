const querystring = require( 'querystring' );
const path = require( 'path' );

const got = require( 'got' );
const TwitterAPI = require( 'twitter' );

const cache = require( './cache.js' );
let config = false;

try {
    config = require( path.join( __dirname, '../../config.js' ) );
} catch ( configLoadError ) {
    console.log( 'Unable to find config file, starting without' );
}

class Load {
    async loadByProvider ( url, options ) {
        switch ( options.provider ) {
            case 'Twitter': {
                const cacheKey = this.getCacheKey( url, options );

                if ( !config.twitter || !config.twitter.bearer_token || !config.twitter.consumer_key || !config.twitter.consumer_secret ) {
                    return false;
                }

                const client = new TwitterAPI( {
                    // eslint-disable-next-line camelcase
                    bearer_token: config.twitter.bearer_token,
                    // eslint-disable-next-line camelcase
                    consumer_key: config.twitter.consumer_key,
                    // eslint-disable-next-line camelcase
                    consumer_secret: config.twitter.consumer_secret,
                } );

                const twitterData = await client.get( url, options.parameters );
                const JSONTwitterData = JSON.stringify( twitterData );

                await cache.store( cacheKey, JSONTwitterData, options.permanent );

                return JSONTwitterData;
            }
            default: {
                console.error( `Unknown provider "${ options.provider } "` );

                return false;
            }
        }
    }

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

            if ( options && options.provider ) {
                urlJSONData = await this.loadByProvider( url, options );
            } else {
                urlJSONData = await this.loadFromUrl( url );
            }
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
