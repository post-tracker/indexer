const sqlite3 = require( 'sqlite3' );

class Post {
    isValid ( filterData ) {
        if ( this.text.length <= 0 ) {
            return false;
        }

        // Filter for specific forums if we want
        if ( filterData && filterData.matchOnly ) {
            let invalid = true;

            if ( !Array.isArray( filterData.matchOnly ) ) {
                filterData.matchOnly = [ filterData.matchOnly ];
            }

            for ( let i = 0; i < filterData.matchOnly.length; i = i + 1 ) {
                if ( filterData.matchOnly[ i ] === this.section ) {
                    invalid = false;
                    break;
                }
            }

            if ( invalid ) {
                return false;
            }
        }

        // Filter for specific forums if we want
        if ( filterData && filterData.exclude ) {
            let invalid = false;

            if ( !Array.isArray( filterData.exclude ) ) {
                filterData.exclude = [ filterData.exclude ];
            }

            for ( let i = 0; i < filterData.exclude.length; i = i + 1 ) {
                if ( filterData.exclude[ i ] === this.section ) {
                    invalid = true;
                    break;
                }
            }

            if ( invalid ) {
                return false;
            }
        }

        return true;
    }

    async postExists ( database ) {
        return new Promise( ( resolve, reject ) => {
            database.get( `SELECT COUNT(*) AS postCount FROM posts WHERE url = '${ this.url }' LIMIT 1`, ( error, response ) => {
                if ( error ) {
                    reject( error );

                    return false;
                }

                if ( response.postCount > 0 ) {
                    resolve( true );

                    return true;
                }

                resolve( false );

                return false;
            } );
        } );
    }

    async save ( databasePath, filterData ) {
        return new Promise( ( resolve, reject ) => {
            if ( !this.isValid( filterData ) ) {
                return false;
            }

            const database = new sqlite3.Database( databasePath );

            this.postExists( database )
                .then( ( exists ) => {
                    if ( exists ) {
                        database.close();
                        resolve();

                        return false;
                    }

                    if ( this.timestamp <= 0 ) {
                        this.timestamp = new Date().getTime();
                    }

                    const insertPostStatement = database.prepare( 'INSERT INTO posts ( topic, topic_url, uid, url, source, content, timestamp ) VALUES( $topic, $topicUrl, $uid, $url, $source, $content, $timestamp )' );
                    const insertValues = {
                        $content: this.text,
                        $source: this.source,
                        $timestamp: this.timestamp,
                        $topic: this.topic.title,
                        $topicUrl: this.topic.url,
                        $uid: this.uid,
                        $url: this.url,
                    };

                    insertPostStatement.run( insertValues, ( savePostError ) => {
                        insertPostStatement.finalize();
                        database.close();

                        if ( savePostError ) {
                            reject( savePostError );

                            return false;
                        }

                        resolve();

                        return true;
                    } );

                    return true;
                } )
                .catch( ( error ) => {
                    database.close();
                    console.log( error );
                } );

            return true;
        } );
    }
}

module.exports = Post;
