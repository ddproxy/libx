import { observable, IObservableArray, action } from 'mobx'
const map = require('lodash/map')
const filter = require('lodash/filter')
const find = require('lodash/find')
const some = require('lodash/some')

/**
 * Used in various Lodash functions such as `map`, `filter`..
 */
export interface IIteratee<T, M> {
  (input: T, index: number): M
}

/**
 * Indexed collection used for reusing models.
 */
export interface ICollection<T> {
  /**
   * The actual item map.
   */
  items: IObservableArray<T>
  /**
   * Getter for the items length.
   */
  length: number
  /**
   * Adds one or more models to the end of the collection.
   */
  add (models: T | T[]): this
  /**
   * Gets items by ids.
   */
  get (id: any[]): Array<T | undefined>
  /**
   * Gets a item by id.
   */
  get (id: any): T | undefined
  /**
   * Adds a single item and maps it using the mapper in the options.
   */
  set (data?: IObjectLike): T | undefined
  /**
   * Same as the singular version, but with multiple.
   */
  set (data?: IObjectLike[]): T[] | undefined
  /**
   * Clears the collection.
   */
  clear(): this
  /**
   * Maps over the items.
   */
  map<M> (iteratee: IIteratee<T, M>): M[]
  /**
   * Filters the items.
   */
  filter (iteratee: IIteratee<T, boolean>): T[]
  /**
   * Determines if there are any items that match the predicate.
   */
  some (iteratee: IIteratee<T, boolean>): boolean
  /**
   * Finds a particular item.
   */
  find (iteratee: IIteratee<T, boolean>): T | undefined
  /**
   * Removes an item based on ID or the item itself.
   */
  remove (modelOrId: T | string): this
  /**
   * Slices the array.
   */
  slice (start?: number, end?: number): T[]
}

/**
 * Any object-like.. object.
 */
export interface IObjectLike {
  [key: string]: any
}

/**
 * Called when the collection wants to add a new item.
 */
export interface ICreateFunc<T> {
  (input: IObjectLike, opts: ICollectionOptions<T>): T
}

/**
 * Called when the collection wants to update an existing item.
 */
export interface IUpdateFunc<T> {
  (existing: T, input: IObjectLike, opts: ICollectionOptions<T>): T
}

/**
 * Function used for getting the ID of a particular input.
 */
export interface IGetId<T> {
  // Returned value will be stringified.
  (obj: T, opts: ICollectionOptions<T>): any
}

/**
 * Collection options.
 */
export interface ICollectionOptions<T> {
  /**
   * May be used by callbacks like `getModelId` and `getDataId`
   */
  idAttribute?: string
  /**
   * Called when the collection wants to add a new item.
   */
  create?: ICreateFunc<T>
  /**
   * Called when the collection wants to update an existing item with more data.
   */
  update?: IUpdateFunc<T>
  /**
   * Used to get the ID of a model that was passed in. Whatever is returned from
   * this should be coercible to a string, and is used for indexing.
   */
  getModelId?: IGetId<T>
  /**
   * Used to get an ID from input data, used to determine whether to create
   * or update.
   */
  getDataId?: IGetId<IObjectLike>
}

/**
 * Default collection options.
 */
export const defaults: ICollectionOptions<any> = {
  create: (input, opts) => input,
  getDataId: (input, opts) => input[opts.idAttribute || 'id'],
  getModelId: (existing, opts) => existing[opts.idAttribute || 'id'],
  idAttribute: 'id',
  update: (existing, input, opts) => Object.assign(existing, input)
}

export type ModelId = string | number | Date

/**
 * Creates a collection.
 *
 * @type {T} The item type.
 * @type {O} Additional options.
 */
export function collection<T> (
  opts?: ICollectionOptions<T>
): ICollection<T> {
  opts = Object.assign({}, defaults, opts)
  // Holds the actual items.
  const items: IObservableArray<T> = observable.shallowArray([])

  const self = {
    items,
    add: action(add),
    get,
    set: action(set),
    remove: action(remove),
    clear: action(clear),
    filter: bindLodashFunc(items, filter),
    some: bindLodashFunc(items, some),
    find: bindLodashFunc(items, find),
    map: bindLodashFunc(items, map),
    slice,
    get length () {
      return items.length
    }
  }

  function get (id: ModelId[]): Array<T | undefined>
  function get (id: ModelId): T | undefined
  function get (id: ModelId | ModelId[]): (T | undefined) | Array<T | undefined> {
    const idAsString: string = id.toString()
    return Array.isArray(id) ? id.map(get) as T[] : items.find((item) => {
      const modelId = opts!.getModelId!(item, opts!)
      if (!modelId) {
        return false
      }

      return modelId.toString() === idAsString
    })
  }

  function set (data?: IObjectLike, setOpts?: ICollectionOptions<T>): T | undefined
  function set (data?: IObjectLike[], setOpts?: ICollectionOptions<T>): T[] | undefined
  function set (data?: IObjectLike | IObjectLike[], setOpts?: ICollectionOptions<T>): T | T[] | undefined {
    if (!data) {
      return undefined
    }

    if (Array.isArray(data)) {
      return data.map((d) => set(d, setOpts) as T) as T[]
    }

    let dataId = opts!.getDataId!(data, Object.assign({}, opts as any, setOpts))
    if (dataId === undefined) {
      return undefined
    }

    if (dataId === null) {
      throw new TypeError(`${dataId} is not a valid ID`)
    }

    dataId = dataId.toString()

    const existing = get(dataId as string)
    if (existing) {
      opts!.update!(existing, data, Object.assign({}, opts as any, setOpts))
      return existing
    }

    const created = opts!.create!(data, Object.assign({}, opts as any, setOpts))
    items.push(created)
    return created
  }

  function add (models: T | T[]): ICollection<T> {
    if (!Array.isArray(models)) {
      return add([models])
    }

    // Filter out existing models.
    models = models.filter((x) => items.indexOf(x) === -1)
    items.push(...models)
    return self
  }

  function remove (modelOrId: T | ModelId): ICollection<T> {
    const model = (typeof modelOrId === 'string' || typeof modelOrId === 'number' || modelOrId instanceof Date)
      ? get(modelOrId)
      : modelOrId
    if (!model) {
      return self
    }
    items.remove(model)
    return self
  }

  function clear (): ICollection<T> {
    items.clear()
    return self
  }

  function slice (start?: number, end?: number) {
    return items.slice(start, end)
  }

  return self
}

/**
 * Utility for binding lodash functions.
 */
function bindLodashFunc (items: IObservableArray<any>, func: any): any {
  return (...args: any[]) => func(items, ...args)
}
