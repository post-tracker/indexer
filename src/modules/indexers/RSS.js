const FeedMe = require( 'feedme' );
const moment = require( 'moment' );

const load = require( '../load.js' );

class RSS {
    constructor ( providerConfig ) {
        this.path = providerConfig.endpoint;

        this.postList = [];
    }

    async loadRecentPosts () {
        const posts = await load.get( this.path );
        const parser = new FeedMe();

        parser.on( 'item', ( item ) => {
            const postData = {};

            postData.url = item.link;
            postData.content = item.description;
            postData.timestamp = moment( item.pubdate ).unix();
            postData.topic = item.title;

            this.postList.push( Object.assign( {}, postData ) );
        } );

        parser.write( posts );

        return this.postList;
    }
}

module.exports = RSS;
