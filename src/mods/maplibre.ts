import { LibraryMod } from "../mods";
import {
  forEachClass,
  hasMethodNames,
  injectIntoConstructor,
  injectIntoMethod,
  type InjectionFunction,
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
        console.log("[Maplibre] Found Map class");
        const mapConstructorInjection: InjectionFunction = (
          { tabDocHandle },
          self,
          options
        ) => {
          self.__PIN_MAP_ID__ = crypto.randomUUID().replace(/-/g, "");

          tabDocHandle.change((doc: any) => {
            doc.objects[self.__PIN_MAP_ID__] = {
              type: "Map",
              data: { options },
            };
          });
        };

        injectIntoConstructor(classNode, mapConstructorInjection);
      }

      // Marker detection: has setLngLat, addTo, remove
      if (hasMethodNames(classNode, ["setLngLat", "addTo", "remove"])) {
        const markerConstructorInjection: InjectionFunction = (
          { tabDocHandle },
          self,
          options
        ) => {
          self.__PIN_MARKER_ID__ = crypto.randomUUID().replace(/-/g, "");

          let position = null;
          if (options && options.latLng) {
            position = { lng: options.latLng.lng, lat: options.latLng.lat };
          }

          tabDocHandle.change((doc: any) => {
            doc.objects[self.__PIN_MARKER_ID__] = {
              type: "Marker",
              data: { position },
            };
          });
        };

        injectIntoConstructor(classNode, markerConstructorInjection);

        const setLngLatInjection: InjectionFunction = (
          { tabDocHandle },
          self,
          lngLatLike
        ) => {
          let lng, lat;

          if (Array.isArray(lngLatLike)) {
            lng = lngLatLike[0];
            lat = lngLatLike[1];
          } else {
            lng = lngLatLike.lng;
            lat = lngLatLike.lat;
          }

          tabDocHandle.change((doc: any) => {
            if (doc.objects[self.__PIN_MARKER_ID__]) {
              doc.objects[self.__PIN_MARKER_ID__].data.position = { lng, lat };
              doc.objects[self.__PIN_MARKER_ID__].timestamp = Date.now();
            }
          });
        };

        injectIntoMethod(classNode, "setLngLat", setLngLatInjection);
      }
    });
  },
};
