export namespace main {
	
	export class Book {
	    name: string;
	    cover: string;
	    tags: string[];
	    is_locked: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Book(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.cover = source["cover"];
	        this.tags = source["tags"];
	        this.is_locked = source["is_locked"];
	    }
	}

}

