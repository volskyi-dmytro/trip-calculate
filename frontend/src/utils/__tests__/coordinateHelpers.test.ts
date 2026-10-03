import { describe, it, expect } from 'vitest'
import {
  leafletToMapbox,
  mapboxToLeaflet,
  leafletArrayToMapbox,
  mapboxArrayToLeaflet,
  type LeafletCoordinate,
  type MapboxCoordinate,
} from '../coordinateHelpers'

describe('single-point conversions', () => {
  it('leafletToMapbox swaps [lat, lng] to [lng, lat]', () => {
    expect(leafletToMapbox([50.45, 30.52])).toEqual([30.52, 50.45])
  })

  it('mapboxToLeaflet swaps [lng, lat] to [lat, lng]', () => {
    expect(mapboxToLeaflet([30.52, 50.45])).toEqual([50.45, 30.52])
  })

  it('round-trips back to the original coordinate', () => {
    const coords: LeafletCoordinate[] = [
      [50.45, 30.52],
      [-33.865, -70.66],
      [40.71, -74.0],
      [0, 0],
    ]
    for (const c of coords) {
      expect(mapboxToLeaflet(leafletToMapbox(c))).toEqual(c)
    }
  })
})

describe('array conversions', () => {
  const leaflet: LeafletCoordinate[] = [
    [50.45, 30.52],
    [49.84, 24.03],
    [-33.865, -70.66],
  ]
  const mapbox: MapboxCoordinate[] = [
    [30.52, 50.45],
    [24.03, 49.84],
    [-70.66, -33.865],
  ]

  it('leafletArrayToMapbox converts every element in order', () => {
    expect(leafletArrayToMapbox(leaflet)).toEqual(mapbox)
  })

  it('mapboxArrayToLeaflet converts every element in order', () => {
    expect(mapboxArrayToLeaflet(mapbox)).toEqual(leaflet)
  })

  it('returns a new array and does not mutate the input', () => {
    const leafletInput: LeafletCoordinate[] = leaflet.map(c => [...c] as LeafletCoordinate)
    const mapboxInput: MapboxCoordinate[] = mapbox.map(c => [...c] as MapboxCoordinate)

    const toMapbox = leafletArrayToMapbox(leafletInput)
    const toLeaflet = mapboxArrayToLeaflet(mapboxInput)

    expect(toMapbox).not.toBe(leafletInput)
    expect(toLeaflet).not.toBe(mapboxInput)
    expect(leafletInput).toEqual(leaflet)
    expect(mapboxInput).toEqual(mapbox)
  })

  it('returns an empty array for an empty input', () => {
    expect(leafletArrayToMapbox([])).toEqual([])
    expect(mapboxArrayToLeaflet([])).toEqual([])
  })
})
