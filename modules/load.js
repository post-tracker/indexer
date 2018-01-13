const querystring = require( 'querystring' );
const path = require( 'path' );

const got = require( 'got' );
const TwitterAPI = require( 'twitter' );

const cache = require( './cache.js' );

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

                if (  !process.env.TWITTER_BEARER_TOKEN || !process.env.TWITTER_CONSUMER_KEY || !process.env.TWITTER_CONSUMER_SECRET ) {
                    return false;
                }

                if ( this.twitterLimitExceeded ) {
                    return false;
                }

                const client = new TwitterAPI( {
                    // eslint-disable-next-line camelcase
                    bearer_token: process.env.TWITTER_BEARER_TOKEN,
                    // eslint-disable-next-line camelcase
                    consumer_key: process.env.TWITTER_CONSUMER_KEY,
                    // eslint-disable-next-line camelcase
                    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
                } );

                try {
                    twitterData = await client.get( url, options.parameters );
                } catch ( loadingError ) {
                    if ( !loadingError[ 0 ] ) {
                        console.log( `Failed to load ${ url } with ${ JSON.stringify( options.parameters, null, 4 ) }` );
                        console.log( loadingError );

                        return false;
                    }

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
                            try {
                                await cache.store( cacheKey, false, options.permanent );
                            } catch ( storeError ) {
                                console.error( storeError );
                            }

                            break;
                        default:
                            console.error( url );
                            console.error( options );
                            console.error( loadingError[ 0 ].code, loadingError[ 0 ].message );
                    }

                    return false;
                }

                const JSONTwitterData = JSON.stringify( twitterData );

                this.providers.twitter = this.providers.twitter + 1;

                if ( twitterData !== false ) {
                    try {
                        await cache.store( cacheKey, JSONTwitterData, options.permanent );
                    } catch ( storeError ) {
                        console.error( storeError );
                    }
                }

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
        const cacheKey = this.getCacheKey( url, options );
        const requestOptions = {
            headers: {
                'user-agent': 'web:dev-post-indexer:v1.0.0 (by /u/kokarn)',
            },
            timeout: 20000,
        };

        if ( options.headers ) {
            requestOptions.headers = Object.assign(
                {},
                requestOptions.headers,
                options.headers
            );
        }

        if ( options.body ) {
            requestOptions.body = options.body;
        }

        try {
            response = await got( url, requestOptions );
        } catch ( urlLoadError ) {
            if ( typeof urlLoadError.code === 'undefined' ) {
                console.error( urlLoadError );
            } else {
                console.error( `${ url } failed with ${ urlLoadError.code }` );
            }
            this.fails = this.fails + 1;

            return false;
        }

        this.webHits = this.webHits + 1;
        try {
            await cache.store( cacheKey, response.body, options.permanent );
        } catch ( storeError ) {
            console.error( storeError );
        }

        return response.body;
    }

    async loadFromCache ( key ) {
        try {
            return await cache.get( key );
        } catch ( getError ) {
            console.error( getError );
        }

        return false;
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

    async get ( url, fetchOptions ) {
        let source = 'cache';
        const options = Object.assign( {}, fetchOptions );
        const cacheKey = this.getCacheKey( url, fetchOptions );

        let urlData;

        try {
            urlData  = await this.loadFromCache( cacheKey );
        } catch ( cacheLoadError ) {
            console.error( cacheLoadError );
        }

        if ( urlData ) {
            this.cacheHits = this.cacheHits + 1;
        } else {
            // console.log( `Couldn't find ${ cacheKey } in cache, loading from external source` );
            source = 'web';

            if ( options.provider ) {
                try {
                    urlData = await this.loadByProvider( url, options );
                } catch ( loadError ) {
                    console.error( loadError );
                }
            } else {
                try {
                    urlData = await this.loadFromUrl( url, options );
                } catch ( loadError ) {
                    console.error( loadError );
                }
            }
        }

        // Early return if we don't have data because false is valid JSON
        if ( urlData === false ) {
            return false;
        }

        if ( !fetchOptions || !fetchOptions.isJSON ) {
            return urlData;
        }

        try {
            return JSON.parse( urlData );
        } catch ( parseError ) {
            console.log( `Failed to parse ${ url } from ${ source }.` );
            try {
                await cache.cleanIndex( cacheKey );
            } catch ( cleanError ) {
                console.error( cleanError );
            }

            return false;
        }
    }
}

module.exports = new Load();
