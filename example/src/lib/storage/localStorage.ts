export class LocalStorage {
    prefix: string = "msg"
    itemName: string
    cache: any[] = []

    constructor(prefix: string) {
        this.itemName = `${prefix}-cache-dispatcher`
        this.load()
    }

    load = () => {
        const item = localStorage.getItem(this.itemName)
        if (item)
            this.cache = JSON.parse(item)
    }

    save = () => {
        localStorage.setItem(this.itemName, JSON.stringify(this.cache))
    }

    push = (data: any) => {
        this.cache.push(data)
        this.save()
    }

    getAll = () => {
        return this.cache
    }
}