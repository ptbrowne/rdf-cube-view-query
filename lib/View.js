const CubeSource = require('./CubeSource')
const Dimension = require('./Dimension')
const Node = require('./Node')
const ns = require('./namespaces')
const { findDataset, findParent, objectSetterGetter, toTerm } = require('./utils')
const ViewQuery = require('./query/ViewQuery')

class View extends Node {
  constructor ({ parent, term, dataset, graph, dimensions = [], filters = [], source } = {}) {
    super({
      parent: parent || findParent([...dimensions, ...filters]),
      term,
      dataset: dataset || findDataset([...dimensions, ...filters]),
      graph
    })

    this.source = source
    this.dimensions = []
    this.filters = []

    this.ptr.addOut(ns.rdf.type, ns.view.View)

    if (!this.ptr.out(ns.view.projection).term) {
      this.ptr.addOut(ns.view.projection)
    }

    for (const dimension of dimensions) {
      this.addDimension(dimension)
    }

    for (const filter of filters) {
      this.addFilter(filter)
    }
  }

  dimension ({ cubeDimension }) {
    if (cubeDimension) {
      const term = toTerm(cubeDimension)

      return this.dimensions.find(dimension => {
        return dimension.cubeDimensions.some(cubeDimension => cubeDimension.path.equals(term))
      })
    }

    return null
  }

  createDimension ({ aggregate, as, join, path, source }) {
    const dimension = new Dimension({
      parent: this,
      aggregate,
      as,
      join,
      path,
      source
    })

    return dimension
  }

  addDimension (dimension) {
    this.ptr.addOut(ns.view.dimension, toTerm(dimension))

    this.dimensions.push(dimension)

    return this
  }

  addFilter (filter) {
    this.ptr.addOut(ns.view.filter, toTerm(filter))

    this.filters.push(filter)

    return this
  }

  offset (offset) {
    return objectSetterGetter(this, ns.view.offset, offset, {
      map: parseInt,
      ptr: this.ptr.out(ns.view.projection)
    })
  }

  limit (limit) {
    return objectSetterGetter(this, ns.view.limit, limit, {
      map: parseInt,
      ptr: this.ptr.out(ns.view.projection)
    })
  }

  observationsQuery ({ disableDistinct } = {}) {
    return new ViewQuery(this.ptr, { disableDistinct })
  }

  async observations ({ disableDistinct } = {}) {
    const sources = new Set([...this.dimensions].reduce((all, d) => {
      return all.concat(Array.isArray(d.source) ? d.source : [d.source])
    }, []))

    const source = [...sources][0]

    const { query, dimensions } = this.observationsQuery({ disableDistinct })

    const columns = dimensions.array.filter(d => d.isResult).map(d => [d.variable, d.property])
    const rows = await source.client.query.select(query, { operation: source.queryOperation })

    return rows.map(row => {
      const output = {}

      for (const [variable, property] of columns) {
        output[property.value] = row[variable.value]
      }

      return output
    })
  }

  async observationCount ({ disableDistinct } = {}) {
    const sources = new Set([...this.dimensions].reduce((all, d) => {
      return all.concat(Array.isArray(d.source) ? d.source : [d.source])
    }, []))

    const source = [...sources][0]

    const { countQuery } = this.observationsQuery({ disableDistinct })

    const result = await source.client.query.select(countQuery, { operation: source.queryOperation })

    return parseInt(result[0].count.value)
  }

  static fromCube (cube) {
    const cubeSource = CubeSource.fromSource(cube.source, cube)

    const view = new View({ parent: cube })

    cube.dimensions.forEach(cubeDimension => {
      view.addDimension(view.createDimension({
        source: cubeSource,
        path: cubeDimension.path,
        as: cubeDimension.path
      }))
    })

    return view
  }
}

module.exports = View
