# Ampel Dashboard

## Purpose

This is a single-page application for viewing the contents of a database of astronomical observations and derived quantities that was populated by a framework called Ampel (repositories in GitHub orgs AmpelProject, AmpelAstro) These observations are filtered from a much larger stream through a set of selections, called channels. Calculations are carried out by "units." All the data are public and read-only, so there is no need for authorization.

## Backing data

Data are split into several collections, each with its own document type:

### Stock

A stock document represents an underlying object, in this case an astronomical transient at a certain point on the sky. Other documents are tied to it via a stock id. It contains a journal recording acitivities related to the stock, as well as a body that for the moment only records the location. In addition it records channels (selections that include the stock) and tags (freeform strings that denote some property), as well as a record of the unix epoch when the document was last updated (upd.any, upd.CHANNEL_A, upd.CHANNEL_B, etc).

### T0 doc (DataPoint)

an individual observation, with freeform body, channel, and tags. While the body is freeform, the set of fields is effectively fixed. It represents a flux of photons measured at some point in the sky at a point in time, calculated from the difference between a new image and a reference image of the long-term average flux from that point. This lets you see all manner of transient phenomena like variable stars, supernovae, active galactic nuclei, tidal disruption of stars, etc, but also a lot of junk: asteroids, satellites, subtraction artifacts. Here's an example:

```javascript
  {
    _id: ObjectId('6ab3db1508b11ff5f2cb541a'),
    id: Long('3147086279643857915'),
    body: {
      diaSourceId: Long('170661895494699058'),
      visit: Long('2026071200735'),
      midpointMjdTai: 61234.28724595907,
      ra: 283.7684676313654,
      raErr: 0.00000783247742219828,
      dec: -20.710232334384152,
      decErr: 0.0000077559489000123,
      ra_dec_Cov: 1.027581882431794e-12,
      centroid_flag: false,
      apFlux_flag: false,
      apFlux_flag_apertureTruncated: false,
      isNegative: true,
      snr: 26.811603546142578,
      psfFlux: -16371.134765625,
      psfFluxErr: 599.4498901367188,
      psfFlux_flag: false,
      psfFlux_flag_edge: false,
      psfFlux_flag_noGoodPixels: false,
      trail_flag_edge: false,
      forced_PsfFlux_flag: false,
      forced_PsfFlux_flag_edge: false,
      forced_PsfFlux_flag_noGoodPixels: false,
      templateFlux: 26407.517578125,
      templateFluxErr: 127.21295928955078,
      shape_flag: false,
      shape_flag_no_pixels: false,
      shape_flag_not_contained: false,
      shape_flag_parent_source: false,
      reliability: 0.9983886480331421,
      band: 'r',
      pixelFlags: false,
      pixelFlags_bad: false,
      pixelFlags_cr: false,
      pixelFlags_crCenter: false,
      pixelFlags_edge: false,
      pixelFlags_nodata: false,
      pixelFlags_nodataCenter: false,
      pixelFlags_interpolated: false,
      pixelFlags_interpolatedCenter: false,
      pixelFlags_offimage: false,
      pixelFlags_saturated: false,
      pixelFlags_saturatedCenter: false,
      pixelFlags_suspect: false,
      pixelFlags_suspectCenter: false,
      pixelFlags_streak: false,
      pixelFlags_streakCenter: false,
      pixelFlags_injected: false,
      pixelFlags_injectedCenter: false,
      pixelFlags_injected_template: false,
      pixelFlags_injected_templateCenter: false
    },
    channel: [ 'HU_VRO_INFANT', 'HU_VRO_EXTRAGALACTIC' ],
    expiry: ISODate('2026-10-24T01:58:18.000Z'),
    meta: [
      {
        ts: 1790171898,
        run: 198,
        alert: Long('170661895494699058'),
        alert_ts: Long('1790171898452'),
        alert_topic: 'lsst-ampel-dev-alerts',
        alert_part: 24,
        alert_offset: 2,
        activity: [
          {
            action: 2048,
            channel: [ 'HU_VRO_INFANT', 'HU_VRO_EXTRAGALACTIC' ]
          },
          { action: 64, tag: 'LSST' }
        ],
        traceid: { shaper: 0 }
      }
    ],
    stock: [ Long('170635466940874972') ],
    tag: [ 'LSST', 'LSST_R', 'LSST_DP' ]
  }
```

Top-level fields:

- id: a unique identifier (computed from a hash of the body)
- channel: channels that have selected this datapoint
- stock: stocks ids this point is associated with (stock <-> datapoint is many-to-many)
- tag: freeform tags. In the example, LSST is the instrument, LSST_R the bandpass, and LSST_DP the method used the derive the flux in the datapoint (discovery photometry, less precise than FP, forced photometry)
  Important fields in the body:
- ra, dec, raErr, decErr, ra_dec_Cov: location and error of the source
- band: filter the image was taken in (one of ugrizy), i.e. the color of light it is sensitive to
- psfFlux, psfFluxErr: flux and error thereon, in nJy. Fluxes _should_ be positive for real astronomical transients; a negative flux generally indicates that something went wrong.
- snr: signal-to-noise ratio of the measured flux
- reliability: a score between 0 and 1 indicating how unlikely the subtraction is to be an artifact.
  The remaining fields are useful for selecting reliable observations, but it's unlikely that anyone will look at them once a point is selected.

### T1 doc (Compound)

Ties datapoints together to form a "state," or the light curve of an object at a given point in time.
Example:

```javascript
{
  _id: ObjectId('6ab3db1508b11ff5f2cb541f'),
  link: -1462189239,
  stock: Long('170635466940874972'),
  channel: [ 'HU_VRO_INFANT', 'HU_VRO_EXTRAGALACTIC' ],
  dps: [
    Long('-5544540861876534107'),
    Long('-3467525933605439334'),
    Long('3147086279643857915'),
    Long('8081518251964241609')
  ],
  expiry: ISODate('2026-11-01T07:17:26.000Z'),
  meta: [
    {
      run: 198,
      ts: 1790171898,
      tier: 0,
      alert: Long('170661895494699058'),
      alert_ts: Long('1790171898452'),
      alert_topic: 'lsst-ampel-dev-alerts',
      alert_part: 24,
      alert_offset: 2,
      code: 0,
      activity: [
        {
          action: 133136,
          channel: [ 'HU_VRO_INFANT', 'HU_VRO_EXTRAGALACTIC' ]
        },
        { action: 64, tag: 'LSST' }
      ],
      traceid: {
        alertconsumer: 0,
        combiner: Long('7576842588195436771'),
        muxer: Long('2321105737850528525')
      }
    },
    {
      run: 478,
      ts: 1790673535,
      tier: 0,
      alert: Long('170661895494699058'),
      alert_ts: Long('1790673521879'),
      alert_topic: 'lsst-ampel-dev-alerts',
      alert_part: 23,
      alert_offset: 100,
      code: 0,
      activity: [
        {
          action: 133136,
          channel: [ 'HU_VRO_INFANT', 'HU_VRO_EXTRAGALACTIC' ]
        },
        { action: 64, tag: 'LSST' }
      ],
      traceid: {
        alertconsumer: 0,
        combiner: Long('7576842588195436771'),
        muxer: Long('2321105737850528525')
      }
    },
    {
      run: 2898,
      ts: 1790882246,
      tier: 0,
      alert: Long('170661895494699058'),
      observation_reason: 'pairs_gr_33.0',
      target_name: 'lowdust, bulgy',
      code: 0,
      activity: [
        {
          action: 133136,
          channel: [ 'HU_VRO_EXTRAGALACTIC', 'HU_VRO_INFANT' ]
        },
        { action: 64, tag: 'LSST' }
      ],
      traceid: {
        alertconsumer: 0,
        combiner: Long('7178314030588326297'),
        muxer: Long('-8658942860987816988')
      }
    }
  ],
  tag: [ 'LSST' ]
}
```

Fields:

- stock: stock id
- unit: created this doc
- dps: list of datapoint ids
- link: identifier (hash of dps)
- channels: requested the creation of this doc

### T2 doc

Results of a calculation on a stock, single datapoint, or collection of datapoints.

Fields:

- stock: stock id
- unit: created this doc
- body: freeform, defined by the unit
- link: id of the document this calculation is based on
- col: kind of source document. 'stock' means StockDocument, 't0' means DataPoint, and no value means 't1' (and implicitly, the datapoints referenced by the t1 doc)

Example (tied to single datapoint):

```javascript
{
  _id: ObjectId('6ab3db1508b11ff5f2cb5412'),
  link: Long('-3467525933605439334'),
  config: Long('4426607224383528467'),
  stock: Long('170635466940874972'),
  unit: 'T2CatalogMatch',
  body: [
    {
      AAVSOVSX: null,
      DESIDR1: null,
      DESIDR1_stars: null,
      GAIADR2: {
        dist2transient: 0.0461141332059883,
        RA: 4.9526942742942435,
        Dec: -0.3614616731855958,
        Plx: -0.2771328806142776,
        ErrPlx: 1.0251084421550143,
        PMRA: 3.2235790787658916,
        ErrPMRA: 2.6599383025917396,
        PMDec: -8.247880414692524,
        ErrPMDec: 2.1690799228084554,
        ExcessNoise: 0,
        ExcessNoiseSig: 0,
        Mag_G: 20.452051
      },
      GLADEv23: null,
      LAMOSTDR4: null,
      LSPhotoZZou: null,
      NEDLVS: null,
      NEDz: null,
      NEDz_extcats: null,
      NED2026: null,
      PS1: {
        dist2transient: 0.13150112990686888,
        gPSFMag: 20.9419,
        gPSFMagErr: 0.029267,
        rPSFMag: 20.4321,
        rPSFMagErr: 0.019822,
        iPSFMag: 20.8874,
        iPSFMagErr: 0.057029,
        zPSFMag: 20.1982,
        zPSFMagErr: 0.03899,
        yPSFMag: 20.2094,
        yPSFMagErr: 0.083721
      },
      PS1_photoz: null,
      SDSSDR10: null,
      SDSS_spec: null,
      TNS: null,
      WISE: null,
      brescia: null,
      milliquas: null,
      twoMPZ: null,
      wiseScosPhotoz: null,
      wise_color: null
    }
  ],
  channel: [ 'HU_VRO_EXTRAGALACTIC' ],
  code: 0,
  col: 't0',
  expiry: ISODate('2026-11-01T07:17:26.000Z'),
  meta: [
    {
      run: 198,
      ts: 1790171898,
      tier: 0,
      alert: Long('170661895494699058'),
      alert_ts: Long('1790171898452'),
      alert_topic: 'lsst-ampel-dev-alerts',
      alert_part: 24,
      alert_offset: 2,
      activity: [
        { action: 133120, channel: 'HU_VRO_EXTRAGALACTIC' },
        { action: 64, tag: 'LSST' }
      ],
      traceid: { alertconsumer: 0 }
    },
    {
      run: 201,
      ts: 1790171899,
      tier: 2,
      code: 0,
      duration: 0.709,
      activity: [ { action: 139264 } ],
      traceid: {
        t2worker: Long('-9148117992536636095'),
        t2unit: Long('452958199442750554')
      }
    },
    {
      run: 478,
      ts: 1790673535,
      tier: 0,
      alert: Long('170661895494699058'),
      alert_ts: Long('1790673521879'),
      alert_topic: 'lsst-ampel-dev-alerts',
      alert_part: 23,
      alert_offset: 100,
      activity: [
        { action: 133120, channel: 'HU_VRO_EXTRAGALACTIC' },
        { action: 64, tag: 'LSST' }
      ],
      traceid: { alertconsumer: 0 }
    },
    {
      run: 2898,
      ts: 1790882246,
      tier: 0,
      alert: Long('170661895494699058'),
      observation_reason: 'pairs_gr_33.0',
      target_name: 'lowdust, bulgy',
      activity: [
        { action: 133120, channel: 'HU_VRO_EXTRAGALACTIC' },
        { action: 64, tag: 'LSST' }
      ],
      traceid: { alertconsumer: 0 }
    }
  ],
  tag: [ 'LSST' ]
}
```

More complicated example (tied to a t1 doc):

```javascript
{
  _id: ObjectId('6ab3db8708b11ff5f2cb5458'),
  stock: Long('170437590624241103'),
  config: Long('6146301405875001843'),
  unit: 'T2RunParsnipRiseDecline',
  link: 1636603082,
  body: [
    {
      fitdatainfo: {
        z: [ 0.266 ],
        z_source: 'AMPELz_group6',
        z_weights: null,
        jdstart: -Infinity,
        jdend: Infinity
      },
      risedeclinefeatures: {
        ndet: 4,
        frac_pos: 0,
        jd_det: 2461183.8897779933,
        jd_last: 2461234.787686235,
        t_lc: 50.89790824148804,
        t_predetect: null,
        success: true,
        eta_lsstr_flux: 2.703394089809941,
        maximum_slope_lsstr_flux: 9794.733053219925,
        periodogram_period_0_lsstr_flux: 96.94839665045339,
        periodogram_period_s_to_n_0_lsstr_flux: 1.261921490701118,
        skew_lsstr_flux: 1.8594538064811992,
        excess_variance_lsstr_flux: 0.014676358437668843,
        linear_fit_reduced_chi2_lsstr_flux: 2030.9865937733907,
        anderson_darling_normal_lsstr_flux: 0.24391689516595652,
        kurtosis_lsstr_flux: 3.5736923619907515,
        stetson_K_lsstr_flux: 0.9474209125916915,
        eta_flux: 2.703394089809941,
        maximum_slope_flux: 9794.733053219925,
        periodogram_period_0_flux: 96.94839665045339,
        periodogram_period_s_to_n_0_flux: 1.261921490701118,
        skew_flux: 1.8594538064811992,
        excess_variance_flux: 0.014676358437668843,
        linear_fit_reduced_chi2_flux: 2030.9865937733907,
        anderson_darling_normal_flux: 0.24391689516595652,
        kurtosis_flux: 3.5736923619907515,
        stetson_K_flux: 0.9474209125916915,
        col_ps1_gr: -0.18329999999999913,
        col_ps1_ri: 0.6856000000000009,
        col_ps1_iz: 0.896099999999997,
        ampel_dist: 1.5900661618869234
      },
      classifications: [
        {
          name: 'elasticcv2',
          version: '0.1',
          parsnip: [ { model: 'sn+2ulens+dwarfs', failed: 'NoFit' } ],
          xgbbinary: {},
          xgbmulti: {},
          features: {
            ndet: 4,
            frac_pos: 0,
            jd_det: 2461183.8897779933,
            jd_last: 2461234.787686235,
            t_lc: 50.89790824148804,
            t_predetect: null,
            success: true,
            eta_lsstr_flux: 2.703394089809941,
            maximum_slope_lsstr_flux: 9794.733053219925,
            periodogram_period_0_lsstr_flux: 96.94839665045339,
            periodogram_period_s_to_n_0_lsstr_flux: 1.261921490701118,
            skew_lsstr_flux: 1.8594538064811992,
            excess_variance_lsstr_flux: 0.014676358437668843,
            linear_fit_reduced_chi2_lsstr_flux: 2030.9865937733907,
            anderson_darling_normal_lsstr_flux: 0.24391689516595652,
            kurtosis_lsstr_flux: 3.5736923619907515,
            stetson_K_lsstr_flux: 0.9474209125916915,
            eta_flux: 2.703394089809941,
            maximum_slope_flux: 9794.733053219925,
            periodogram_period_0_flux: 96.94839665045339,
            periodogram_period_s_to_n_0_flux: 1.261921490701118,
            skew_flux: 1.8594538064811992,
            excess_variance_flux: 0.014676358437668843,
            linear_fit_reduced_chi2_flux: 2030.9865937733907,
            anderson_darling_normal_flux: 0.24391689516595652,
            kurtosis_flux: 3.5736923619907515,
            stetson_K_flux: 0.9474209125916915,
            col_ps1_gr: -0.18329999999999913,
            col_ps1_ri: 0.6856000000000009,
            col_ps1_iz: 0.896099999999997,
            ampel_dist: 1.5900661618869234
          }
        }
      ]
    }
  ],
  channel: [ 'HU_VRO_EXTRAGALACTIC' ],
  code: 0,
  expiry: ISODate('2026-11-01T07:17:54.000Z'),
  meta: [
    {
      run: 198,
      ts: 1790171899,
      tier: 0,
      alert: Long('170661895613187876'),
      alert_ts: Long('1790171898458'),
      alert_topic: 'lsst-ampel-dev-alerts',
      alert_part: 24,
      alert_offset: 25,
      activity: [
        { action: 133120, channel: 'HU_VRO_EXTRAGALACTIC' },
        { action: 64, tag: 'LSST' }
      ],
      traceid: {
        alertconsumer: 0,
        combiner: Long('7576842588195436771'),
        muxer: Long('2321105737850528525')
      }
    },
    {
      run: 201,
      ts: 1790172037,
      tier: 2,
      code: 0,
      duration: 0.143,
      activity: [ { action: 139272 } ],
      traceid: {
        t2worker: Long('-9148117992536636095'),
        t2unit: Long('-1381180547580621596')
      }
    },
    {
      run: 478,
      ts: 1790673535,
      tier: 0,
      alert: Long('170661895613187876'),
      alert_ts: Long('1790673521882'),
      alert_topic: 'lsst-ampel-dev-alerts',
      alert_part: 5,
      alert_offset: 31,
      activity: [
        { action: 133120, channel: 'HU_VRO_EXTRAGALACTIC' },
        { action: 64, tag: 'LSST' }
      ],
      traceid: {
        alertconsumer: 0,
        combiner: Long('7576842588195436771'),
        muxer: Long('2321105737850528525')
      }
    },
    {
      run: 2899,
      ts: 1790882274,
      tier: 0,
      alert: Long('170661895613187876'),
      observation_reason: 'pairs_gr_33.0',
      target_name: 'lowdust, bulgy',
      activity: [
        { action: 133120, channel: 'HU_VRO_EXTRAGALACTIC' },
        { action: 64, tag: 'LSST' }
      ],
      traceid: {
        alertconsumer: 0,
        combiner: Long('7178314030588326297'),
        muxer: Long('-8658942860987816988')
      }
    }
  ],
  tag: [ 'LSST' ]
}
```

## Backend

The backend provides a GraphQL server that queries the backing database. Treat this as fixed for now, only adding features when explicitly requested.

## Frontend

The frontend should be single-page application using the following stack:

- Vue.js as an event framework
- plotly.js for displaying plots
- Bootstrap for css

### Views

The following views are required

#### Recent

Two-column layout with a sidebar on the left and a main panel. The main view is a table of results from the stock() graphql query.

The sidebar shows pickers for the search constraints. These pickers are interconnected.

- Time range (before, after):
  - defaults to last 7 days
  - two-ended slider with left attached to `after` and right attached to `before`
  - dragging the `after` slider to the left end should double to the time range, adding the current range to the lower end
- Channel (channel):
  - defaults to "all" (no constraint)
  - multi-selection check boxes
  - values populated from stocks in the selected time range
- Location (within):
  - text box for ra, dec, defaults to empty
  - validation rules:
    - must have two values, separated by a comma or whitespace
    - values must be floats
    - ra must be between 0 and 360
    - dec must be between -90 and 90
  - text box for arcsec, defaults to 10
  - validation rules:
    - must be a float > 0 and < 100

The main panel shows one row for each element returned by stocks(). The columns are:

- id: populate from stock (display as a span across all columns at the top of the row)
- more: chiclet-style links to other brokers/surveys. This should cover the left 1/4 of the panel, with an appropriate minimum width for mobile devices. The elements are:
  - Lasair: <https://lasair.lsst.ac.uk/objects/{id}/>
  - Fink: <https://lsst.fink-portal.org/{id}>
  - Alerce: <https://lsst.alerce.online/object/{id}?survey=lsst&page=1&page_size=20&count=false&selected_oid={id}>
  - Catalog matches: one chiclet for each populated key of the body of the last T2CatalogMatch doc listed in the stock journal. No link for now.
- light curve plot, spanning the remainder of the panel width. the points come from the bodies of the datapoints referred to in the stock journal
  - x: midpointMjdTai, (an MJD in the TAI time scale), converted to a date. use only one point per `visit`.
  - y: psfFlux (unit: nJy)
  - yerr: psfFluxErr.
  - use a different symbol for each band
  - use a color from the D3 qualtitative color scale for each `band`:
    - u: blue
    - g: green
    - r: red
    - i: orange
    - z: brown
    - y: pink
  - do not connect the points with lines

# Task

Create an implementation plan for this specification. Examine src/schema.ts to see which queries are implemented already, and plan which additional queries are needed to satisfy the requirements.

Do not write any code yet. Ask for feedback if a requirement is ambiguous. Update the specification as decisions are made.
