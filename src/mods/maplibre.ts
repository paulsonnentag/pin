// import { LngLat, MarkerOptions, MapOptions, Map, LngLatLike } from "maplibre-gl";

import { LibraryMod } from "../core/mods";

export const MAPLIBRE_MOD: LibraryMod = {
  keyword: "maplibre",
  classes: [
    {
      name: "Map",
      requiredMethods: ["addControl", "removeControl", "addSource", "addLayer"],
      methodMods: [
        {
          name: "constructor",
          injection: function (options: any) {
            document.dispatchEvent(
              new CustomEvent("pin:message", {
                detail: {
                  action: "update",
                  objectId: "map",
                  type: "Map",
                  data: { options },
                },
              })
            );
          },
        },
      ],
    },
    {
      name: "Marker",
      requiredMethods: ["setLngLat", "addTo", "remove"],
      methodMods: [
        {
          name: "constructor",
          injection: function (options: any) {
            let position = null;

            if (options && options.latLng) {
              position = { lng: options.latLng.lng, lat: options.latLng.lat };
            }

            console.log("create marker", options);

            document.dispatchEvent(
              new CustomEvent("pin:message", {
                detail: {
                  action: "update",
                  objectId: "marker",
                  type: "Marker",
                  data: { position, options },
                },
              })
            );
          },
        },
        {
          name: "addTo",
          injection: function (map: any) {
            document.dispatchEvent(
              new CustomEvent("pin:message", {
                detail: {
                  action: "update",
                  objectId: (this as any).__PIN_MARKER_ID,
                  type: "Marker",
                  data: { addedToMap: true },
                },
              })
            );
          },
        },
        {
          name: "setLngLat",
          injection: function (lngLatLike: any) {
            let lng, lat;

            if (Array.isArray(lngLatLike)) {
              lng = lngLatLike[0];
              lat = lngLatLike[1];
            } else {
              lng = lngLatLike.lng;
              lat = lngLatLike.lat;
            }

            document.dispatchEvent(
              new CustomEvent("pin:message", {
                detail: {
                  action: "update",
                  objectId: "marker",
                  type: "Marker",
                  data: { position: { lng, lat } },
                },
              })
            );
          },
        },
      ],
    },
  ],
};
