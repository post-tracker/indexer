const https = require( 'https' );

const NTFY_TOPIC = 'post-tracker';
const SUCCESS_STATUS_CODE = 200;

module.exports = function ntfy ( { title, message } ) {
    const body = JSON.stringify( {
        message: message,
        title: title,
        topic: NTFY_TOPIC,
    } );

    const request = https.request( {
        headers: {
            'Content-Length': Buffer.byteLength( body ),
            'Content-Type': 'application/json',
        },
        hostname: 'ntfy.sh',
        method: 'POST',
        path: '/',
    }, ( response ) => {
        if ( response.statusCode !== SUCCESS_STATUS_CODE ) {
            console.error( `[ntfy] ${ title }: status ${ response.statusCode }` );
        }

        response.resume();
    } );

    request.on( 'error', ( requestError ) => {
        console.error( `[ntfy] request error: ${ requestError.message }` );
    } );

    request.end( body );
};
