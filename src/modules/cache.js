const fs = require( 'mz/fs' );
const path = require( 'path' );

const PERMANENT_CACHE_FOLDER_NAME = 'perm';
const CACHE_PATH = '../cache';
const CACHE_TTL = 60000;

class Cache {
    constructor () {
        this.cachePath = path.join( __dirname, CACHE_PATH );
        this.permanentCachePath = path.join( __dirname, CACHE_PATH, PERMANENT_CACHE_FOLDER_NAME );
    }

    create () {
        // eslint-disable-next-line no-bitwise
        fs.access( this.cachePath, fs.constants.R_OK | fs.constants.W_OK, ( cacheFolderPermissionsError ) => {
            if ( cacheFolderPermissionsError ) {
                fs.mkdir( this.cachePath, ( cacheCreateError ) => {
                    if ( cacheCreateError ) {
                        throw cacheCreateError;
                    }

                    // eslint-disable-next-line no-bitwise
                    fs.access( this.permanentCachePath, fs.constants.R_OK | fs.constants.W_OK, ( permanentCacheFolderPermissionsError ) => {
                        if ( permanentCacheFolderPermissionsError ) {
                            fs.mkdir( this.permanentCachePath, ( permanentCacheCreateError ) => {
                                if ( permanentCacheCreateError ) {
                                    throw permanentCacheCreateError;
                                }
                            } );
                        }
                    } );
                } );
            } else {
                // eslint-disable-next-line no-bitwise
                fs.access( this.permanentCachePath, fs.constants.R_OK | fs.constants.W_OK, ( permanentCacheFolderPermissionsError ) => {
                    if ( permanentCacheFolderPermissionsError ) {
                        fs.mkdir( this.permanentCachePath, ( permanentCacheCreateError ) => {
                            if ( permanentCacheCreateError ) {
                                throw permanentCacheCreateError;
                            }
                        } );
                    }
                } );
            }
        } );
    }

    async get ( index ) {
        return new Promise( ( resolve ) => {
            const filePath = path.join( this.cachePath, this.normalizeName( index ) );
            const permanentFilePath = path.join( this.permanentCachePath, this.normalizeName( index ) );

            fs.readFile( filePath, 'utf-8', ( readFileError, fileData ) => {
                if ( readFileError ) {
                    fs.readFile( permanentFilePath, 'utf-8', ( permanentReadFileError, permanentFileData ) => {
                        if ( permanentReadFileError ) {
                            resolve( false );

                            return false;
                        }

                        resolve( permanentFileData );

                        return true;
                    } );

                    return true;
                }

                resolve( fileData );

                return true;
            } );
        } );
    }

    normalizeName ( name ) {
        return name.replace( /[^a-zA-Z0-9\-+]/gim, '' );
    }

    async store ( filename, fileData, permanent = false ) {
        let cachePath = path.join( this.cachePath, this.normalizeName( filename ) );

        if ( permanent ) {
            cachePath = path.join( this.permanentCachePath, this.normalizeName( filename ) );
        }

        try {
            await fs.writeFile( cachePath, fileData );
        } catch ( writeError ) {
            console.error( writeError );
        }

        return true;
    }

    async cleanIndex ( index ) {
        try {
            await fs.unlink( path.join( this.cachePath, this.normalizeName( index ) ) );
        } catch ( unlinkError ) {
            if ( unlinkError ) {
                if ( unlinkError.code === 'ENOENT' ) {
                    return true;
                }

                return false;
            }
        }

        return true;
    }

    async clean ( options ) {
        const currentDate = new Date().getTime();
        let files;

        console.time( 'Cache clean' );

        try {
            files = await fs.readdir( this.cachePath );
        } catch ( readError ) {
            console.error( readError );
        }

        for ( let i = 0; i < files.length; i = i + 1 ) {
            const filePath = path.join( this.cachePath, files[ i ] );

            // Skip the perm folder
            if ( files[ i ] === PERMANENT_CACHE_FOLDER_NAME ) {
                continue;
            }

            if ( options && options.force ) {
                fs.unlink( filePath );

                console.log( `${ files[ i ] } has been cleared` );

                continue;
            }
            let stats;

            try {
                stats = await fs.stat( filePath );
            } catch ( statError ) {
                console.error( statError );
            }

            if ( currentDate - stats.ctime.getTime() > CACHE_TTL ) {
                fs.unlink( filePath );
                // console.log( `${ files[ i ] } was older than ${ CACHE_TTL } ms and has been cleared` );
            }
        }

        console.timeEnd( 'Cache clean' );

        return true;
    }
}

module.exports = new Cache();
