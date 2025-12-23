import { LibraryMod } from "../mods";
import {
  forEachClass,
  hasMethodNames,
  injectIntoConstructor,
  injectIntoMethod,
} from "../ast-helpers";

export const MAPLIBRE_MOD: LibraryMod = {
  keyword: "maplibre",
  mutate: (ast) => {
    forEachClass(ast, (classNode) => {
      // Map detection: has addControl, removeControl, addSource, addLayer
      if (
        hasMethodNames(classNode, [
          "addControl",
          "removeControl",
          "addSource",
          "addLayer",
        ])
      ) {
        injectIntoConstructor(classNode, (self: any, options: any) => {
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
        });
      }

      // Marker detection: has setLngLat, addTo, remove
      if (hasMethodNames(classNode, ["setLngLat", "addTo", "remove"])) {
        injectIntoConstructor(classNode, (self: any, options: any) => {
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
        });

        injectIntoMethod(
          classNode,
          "setLngLat",
          function (self: any, lngLatLike: any) {
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
          }
        );
      }
    });
  },
};
