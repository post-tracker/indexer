const fs = require( 'fs' );
const path = require( 'path' );
const util = require( 'util' );

const CACHE_PATH = '../cache';
const CACHE_TTL = 900000;

class Cache {
    constructor (){
        this.cachePath = path.join( __dirname, CACHE_PATH );        
    }

    create (){
        fs.access( this.cachePath, fs.constants.R_OK | fs.constants.W_OK, ( cacheFolderPermissionsError ) => {
            if( cacheFolderPermissionsError ){
                fs.mkdir( this.cachePath, ( cacheCreateError ) => {
                    if( cacheCreateError ){
                        throw cacheCreateError;
                    }
                })
            }
        });
    }

    async get ( index ){
        return new Promise( ( resolve, reject ) => {
            let filePath = path.join( this.cachePath, this.normalizeName( index ) )
            fs.access( filePath, fs.constants.R_OK, ( cacheReadError ) => {
                if( cacheReadError ){
                    resolve( false );

                    return true;
                }

                fs.readFile( filePath, 'utf-8', ( readFileError, fileData ) => {
                    if( readFileError ){
                        reject( readFileError );

                        return false;
                    }

                    resolve( fileData );
                } );

            });
        })
    }

    normalizeName( name ){
        return name.replace( /[^a-zA-Z0-9\-\+]/gim, '' );
    }

    async store( filename, data ){
        return new Promise( ( resolve, reject ) => {
            fs.writeFile( path.join( this.cachePath, this.normalizeName( filename ) ), data, ( writeError ) => {
                if( writeError ){
                    reject( writeError );

                    return false;
                }

                resolve();
            });
        })
    }

    async cleanIndex( index ){
        return new Promise( ( resolve, reject ) => {
            fs.unlink( path.join( this.cachePath, this.normalizeName( index ) ), ( unlinkError ) => {
                if( unlinkError ){
                    reject( unlinkError );

                    return false;
                }

                console.log( `${ index } has been cleared individually` );

                resolve();
            });
        });
    }

    clean ( options ){
        let currentDate = new Date().getTime();
        fs.readdir( this.cachePath, ( readDirError, files ) => {
            if( readDirError ){
                throw readDirError;
            }

            for( let i = 0; i < files.length; i = i + 1 ){
                let filePath = path.join( this.cachePath, files[ i ] );

                if( options && options.force ){
                    fs.unlink( filePath, ( unlinkError ) => {
                        if( unlinkError ){
                            throw unlinkError;
                        }

                        console.log( `${ files[ i ] } has been cleared` );
                    });

                    continue;
                }

                fs.stat( filePath, ( statError, stats ) => {
                    if( statError ){
                        throw statError;
                    }

                    if( currentDate - stats.ctime.getTime() > CACHE_TTL ){
                        fs.unlink( filePath, ( unlinkError ) => {
                            if( unlinkError ){
                                throw unlinkError;
                            }

                            console.log( `${ files[ i ] } was older than ${ CACHE_TTL } ms and has been cleared` );
                        });
                    }
                });
            }
        } )
    }
}

module.exports = new Cache();
