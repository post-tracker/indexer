const https = require( 'https' );
const querystring = require( 'querystring' );

const sha1 = require( 'sha1' );

const API_HOST = 'api.kokarn.com';
const API_PORT = 443;
// const API_HOST = 'lvh.me';
// const API_PORT = 3000;

const SUCESS_STATUS_CODE = 200;
const EXISTS_STATUS_CODE = 200;

if ( !process.env.API_TOKEN ) {
    throw new Error( 'Unable to load API token' );
}

const get = function get ( requestPath, queryParams ) {
    return new Promise( ( resolve, reject ) => {
        const options = {
            headers: {
                Authorization: `Bearer ${ process.env.API_TOKEN }`,
            },
            hostname: API_HOST,
            method: 'GET',
            path: requestPath,
            port: API_PORT,
            rejectUnauthorized: false,
        };

        if ( queryParams ) {
            options.path = `${ options.path }?${ querystring.stringify( queryParams ) }`;
        }

        const request = https.request( options, ( response ) => {
            let body = '';

            response.setEncoding( 'utf8' );

            if ( response.statusCode !== SUCESS_STATUS_CODE ) {
                reject( new Error( `${ API_HOST }${ requestPath } returned ${ response.statusCode }` ) );

                return false;
            }

            response.on( 'data', ( chunk ) => {
                body = body + chunk;
            } );

            response.on( 'end', () => {
                resolve( JSON.parse( body ) );
            } );

            return true;
        } );

        request.on( 'error', ( requestError ) => {
            console.log( requestError );
            reject( requestError );
        } );

        request.end();
    } );
};

const post = function post ( requestPath, item ) {
    return new Promise( ( resolve, reject ) => {
        const payload = JSON.stringify( item );
        const options = {
            headers: {
                Authorization: `Bearer ${ process.env.API_TOKEN }`,
                'Content-Length': Buffer.byteLength( payload ),
                'Content-Type': 'application/json',
            },
            hostname: API_HOST,
            method: 'POST',
            path: requestPath,
            port: API_PORT,
            rejectUnauthorized: false,
        };

        const request = https.request( options, ( response ) => {
            response.setEncoding( 'utf8' );

            if ( response.statusCode !== SUCESS_STATUS_CODE ) {
                reject( new Error( `${ API_HOST }${ requestPath } returned ${ response.statusCode }` ) );

                return false;
            }

            resolve();

            return true;
        } );

        request.on( 'error', ( requestError ) => {
            console.log( requestError );
            reject( requestError );
        } );

        request.write( payload );

        request.end();
    } );
};

const exists = function exists ( url ) {
    return new Promise( ( resolve, reject ) => {
        const options = {
            hostname: API_HOST,
            method: 'HEAD',
            path: `/admin/posts/${ sha1( url ) }`,
            port: API_PORT,
            rejectUnauthorized: false,
        };

        const request = https.request( options, ( response ) => {
            response.setEncoding( 'utf8' );

            if ( response.statusCode === EXISTS_STATUS_CODE ) {
                resolve( true );

                return false;
            }

            resolve( false );

            return true;
        } );

        request.on( 'error', ( requestError ) => {
            reject( requestError );
        } );

        request.end();
    } );
};

module.exports = {
    exists: exists,
    get: get,
    post: post,
};
