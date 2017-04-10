const path = require( 'path' );
const fs = require( 'fs' );

const md5 = require( 'md5' );

const FILE_INDEX_PATH = path.join( __dirname, '../indexed' );

class Index {
    add ( url ) {
        return new Promise( ( resolve, reject ) => {
            const index = md5( url );

            fs.open( path.join( FILE_INDEX_PATH, index ), 'wx', ( error, fd ) => {
                if ( error ) {
                    reject( error );

                    return false;
                }

                fs.close( fd, ( closeError ) => {
                    if ( closeError ) {
                        reject( closeError );

                        return false;
                    }

                    resolve();

                    return true;
                } );

                return true;
            } );
        } );
    }

    exists ( url ) {
        return new Promise( ( resolve, reject ) => {
            const index = md5( url );

            fs.access( path.join( FILE_INDEX_PATH, index ), ( error ) => {
                if ( error ) {
                    if ( error.code === 'ENOENT' ) {
                        resolve( false );

                        return true;
                    }
                    reject( error );

                    return false;
                }

                resolve( true );

                return true;
            } );
        } );
    }
}


module.exports = new Index();
