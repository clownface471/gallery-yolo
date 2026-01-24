export namespace main {
	
	export class Book {
	    name: string;
	    cover: string;
	
	    static createFrom(source: any = {}) {
	        return new Book(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.cover = source["cover"];
	    }
	}

}

