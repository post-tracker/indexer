const path = require( 'path' );

const AWS = require( 'aws-sdk' );

const MAX_POSTS = 50;

let config;

try {
    // eslint-disable-next-line global-require
    config = require( path.join( __dirname, '../config.js' ) );
} catch ( configLoadError ) {
    throw new Error( 'Unable to find config file' );
}

class Datastore {
    constructor () {
        if ( !config.aws || !config.aws.dynamodb ) {
            throw new Error( 'Unable to load AWS settings from config file' );
        }

        this.dynamodb = new AWS.DynamoDB( {
            accessKeyId: config.aws.dynamodb.accessKeyId,
            region: config.aws.dynamodb.region,
            secretAccessKey: config.aws.dynamodb.secretAccessKey,
        } );
    }

    awsInflate ( regularData ) {
        const returnData = regularData;

        for ( const key in returnData ) {
            switch ( typeof returnData[ key ] ) {
                case 'number':
                    returnData[ key ] = {
                        N: String( returnData[ key ] ),
                    };

                    break;
                case 'string':
                    returnData[ key ] = {
                        S: returnData[ key ],
                    };

                    break;
                case 'object':
                    returnData[ key ] = {
                        M: this.awsInflate( returnData[ key ] ),
                    };

                    break;
                case 'undefined':
                    Reflect.deleteProperty( returnData, key );

                    break;
                default:
                    console.error( `Unknown type ${ typeof returnData[ key ] }` );

            }
        }

        return returnData;
    }

    awsFlatten ( awsData ) {
        const returnData = awsData;

        if ( typeof returnData !== 'object' ) {
            return returnData;
        }

        const keys = Object.keys( returnData );

        if ( keys.length === 1 ) {
            switch ( keys[ 0 ] ) {
                case 'S':
                    return returnData.S;
                case 'M':
                    return this.awsFlatten( returnData.M );
                case 'L':
                    return this.awsFlatten( returnData.L );
                default:
                    return this.awsFlatten( returnData[ keys[ 0 ] ] );
            }
        } else {
            for ( const key in returnData ) {
                returnData[ key ] = this.awsFlatten( returnData[ key ] );
            }
        }

        return returnData;
    }

    storePost ( post ) {
        return new Promise( ( resolve, reject ) => {
            const params = {
                Item: this.awsInflate( post ),
                TableName: 'posts',
            };

            this.dynamodb.putItem( params, ( dbError ) => {
                if ( dbError ) {
                    reject( dbError );

                    return false;
                }

                resolve();

                return true;
            } );
        } );
    }

    getPostsByGame ( game ) {
        return new Promise( ( resolve, reject ) => {
            const params = {
                ExpressionAttributeValues: {
                    ':game': {
                        S: game,
                    },
                },
                IndexName: 'game-timestamp-index',
                KeyConditionExpression: 'game = :game',
                Limit: MAX_POSTS,
                TableName: 'posts',
            };

            this.dynamodb.query( params, ( dbError, dbData ) => {
                if ( dbError ) {
                    reject( dbError );

                    return false;
                }

                resolve( dbData );

                return true;
            } );
        } );
    }

    getPostsWithFilter ( game, filter ) {
        return new Promise( ( resolve, reject ) => {
            const params = {
                ExpressionAttributeValues: {
                    ':game': {
                        S: game,
                    },
                },
                FilterExpression: 'game = :game',
                IndexName: 'game-timestamp-index',
                Limit: MAX_POSTS,
                TableName: 'posts',
            };

            const groupList = [];

            if ( filter && filter.groups ) {
                if ( !params.ExpressionAttributeNames ) {
                    params.ExpressionAttributeNames = {};
                }

                params.ExpressionAttributeNames[ '#G' ] = 'group';

                for ( let i = 0; i < filter.groups.length; i = i + 1 ) {
                    const index = `:${ filter.groups[ i ].toLowerCase().replace( /[^0-9a-z]/g, '' ) }`;

                    groupList.push( index );

                    params.ExpressionAttributeValues[ index ] = {
                        S: filter.groups[ i ],
                    };
                }
            }

            if ( groupList.length > 0 ) {
                params.FilterExpression = `${ params.FilterExpression } AND (#G IN (${ groupList.join( ', ' ) }))`;
            }

            if ( filter && filter.LastEvaluatedKey ) {
                params.ExclusiveStartKey = filter.LastEvaluatedKey;
            }

            if ( filter && filter.searchString ) {
                params.ExpressionAttributeValues[ ':searchString' ] = {
                    S: filter.searchString,
                };

                params.FilterExpression = `${ params.FilterExpression } AND contains(content, :searchString)`;
            }

            // console.log( JSON.stringify( params, null, 4 ) );
            // process.exit();

            this.dynamodb.scan( params, ( dbError, dbData ) => {
                if ( dbError ) {
                    reject( dbError );

                    return false;
                }

                resolve( dbData );

                return true;
            } );
        } );
    }

    async getPosts ( game, filter ) {
        let response;

        if ( filter && Object.keys( filter ).length > 0 ) {
            response = await this.getPostsWithFilter( game, filter );
        } else {
            response = await this.getPostsByGame( game );
        }

        let items = response.Items;

        if ( filter ) {
            while ( items.length < MAX_POSTS && response.LastEvaluatedKey ) {
                filter.LastEvaluatedKey = response.LastEvaluatedKey;
                response = await this.getPostsWithFilter( game, filter );

                items = items.concat( response.Items );
            }
        }

        return this.awsFlatten( items );
    }

    getGames ( gameList ) {
        return new Promise( ( resolve, reject ) => {
            const params = {
                RequestItems: {
                    games: {
                        Keys: [],
                    },
                },
            };

            gameList.forEach( ( title ) => {
                params.RequestItems.games.Keys.push( {
                    title: {
                        S: title,
                    },
                } );

                return false;
            } );

            this.dynamodb.batchGetItem( params, ( dbError, dbData ) => {
                if ( dbError ) {
                    reject( dbError );

                    return false;
                }

                const games = {};

                dbData.Responses.games.forEach( ( game ) => {
                    games[ game.title.S ] = this.awsFlatten( game );
                } );

                resolve( games );

                return true;
            } );
        } );
    }
}

module.exports = new Datastore();
