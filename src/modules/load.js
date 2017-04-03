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
    constructor () {
        this.webHits = 0;
        this.cacheHits = 0;
        this.providers = {
            twitter: 0,
        };
        this.fails = 0;
    }

    async loadByProvider ( url, options ) {
        switch ( options.provider ) {
            case 'Twitter': {
                const cacheKey = this.getCacheKey( url, options );
                let twitterData;

                if ( !config.twitter || !config.twitter.bearer_token || !config.twitter.consumer_key || !config.twitter.consumer_secret ) {
                    return false;
                }

                if ( this.twitterLimitExceeded ) {
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

                try {
                    twitterData = await client.get( url, options.parameters );
                } catch ( loadingError ) {
                    switch ( loadingError[ 0 ].code ) {
                        case 88:
                            this.twitterLimitExceeded = true;

                            break;
                        case 34:
                            // deleted
                            // falls through
                        case 144:
                            // deleted
                            // falls through
                        case 179:
                            // unauthorized
                            await cache.store( cacheKey, false, options.permanent );

                            break;
                        default:
                            console.log( url, options.parameters );
                            console.log( loadingError[ 0 ].code, loadingError[ 0 ].message );
                    }

                    return false;
                }

                const JSONTwitterData = JSON.stringify( twitterData );

                this.providers.twitter = this.providers.twitter + 1;

                await cache.store( cacheKey, JSONTwitterData, options.permanent );

                return JSONTwitterData;
            }
            default: {
                console.error( `Unknown provider "${ options.provider } "` );

                return false;
            }
        }
    }

    async loadFromUrl ( url, options ) {
        let response = false;
        const cacheKey = this.getCacheKey( url );

        try {
            response = await got( url,
                {
                    headers: {
                        'user-agent': 'web:dev-post-indexer:v1.0.0 (by /u/kokarn)',
                    },
                }
            );
        } catch ( urlLoadError ) {
            console.log( `${ url } returned ${ urlLoadError.statusCode }` );
            this.fails = this.fails + 1;

            return false;
        }

        this.webHits = this.webHits + 1;
        await cache.store( cacheKey, response.body, options.permanent );

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

    async get ( url, externalOptions ) {
        let source = 'cache';
        const options = Object.assign( {}, externalOptions );
        const cacheKey = this.getCacheKey( url, externalOptions );

        let urlJSONData = await this.loadFromCache( cacheKey );

        if ( urlJSONData ) {
            this.cacheHits = this.cacheHits + 1;
        } else {
            // console.log( `Couldn't find ${ cacheKey } in cache, loading from external source` );
            source = 'web';

            if ( options.provider ) {
                urlJSONData = await this.loadByProvider( url, options );
            } else {
                urlJSONData = await this.loadFromUrl( url, options );
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
