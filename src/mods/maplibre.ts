import { LibraryMod } from "../mods";

export const MAPLIBRE_MOD: LibraryMod = {
  keyword: "maplibre",
  classes: [
    {
      name: "Map",
      requiredMethods: ["addControl", "removeControl", "addSource", "addLayer"],
      methodMods: [
        {
          name: "constructor",
          injection: (self: any, options: any) => {
            self.__PIN_MAP_ID__ = crypto.randomUUID().replace(/-/g, "");

            document.dispatchEvent(
              new CustomEvent("pin:message", {
                detail: {
                  action: "update",
                  objectId: self.__PIN_MAP_ID__,
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
          injection: (self: any, options: any) => {
            self.__PIN_MARKER_ID__ = crypto.randomUUID().replace(/-/g, "");
            let position = null;

            if (options && options.latLng) {
              position = { lng: options.latLng.lng, lat: options.latLng.lat };
            }

            document.dispatchEvent(
              new CustomEvent("pin:message", {
                detail: {
                  action: "update",
                  objectId: self.__PIN_MARKER_ID__,
                  type: "Marker",
                  data: { position },
                },
              })
            );
          },
        },

        {
          name: "setLngLat",
          injection: function (self: any, lngLatLike: any) {
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
                  objectId: self.__PIN_MARKER_ID__,
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
