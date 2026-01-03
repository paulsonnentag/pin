import { LibraryMod } from "../mods";
import {
  forEachClass,
  hasMethodNames,
  injectIntoConstructor,
  injectIntoMethod,
} from "../ast-helpers";
import { API } from "../../frontend/api";

export const MAPLIBRE_MOD: LibraryMod = {
  keyword: "maplibre",
  mutate: (ast) => {
    forEachClass(ast, (classNode) => {
      // Marker detection: has setLngLat, addTo, remove
      if (hasMethodNames(classNode, ["setLngLat", "addTo", "remove"])) {
        injectIntoConstructor(
          classNode,
          async (api: API, self: any, options: any) => {
            const markerId = crypto.randomUUID().replace(/-/g, "");
            self.__PIN_MARKER_ID__ = markerId;

            if (!options?.lngLat) return;

            const lng = options.lngLat.lng;
            const lat = options.lngLat.lat;

            const handle = await api.getSiteDocHandle();
            handle.change((doc: any) => {
              if (!doc.markers) doc.markers = {};
              doc.objects[markerId] = {
                geolocation: { lat, lng },
              };
            });
          }
        );

        injectIntoMethod(
          classNode,
          "setLngLat",
          async (api: API, self: any, lngLatLike: any) => {
            const markerId = self.__PIN_MARKER_ID__;
            if (!markerId) return;

            let lng: number, lat: number;

            if (Array.isArray(lngLatLike)) {
              lng = lngLatLike[0];
              lat = lngLatLike[1];
            } else {
              lng = lngLatLike.lng;
              lat = lngLatLike.lat;
            }

            const handle = await api.getSiteDocHandle();
            handle.change((doc: any) => {
              if (!doc.objects) doc.objects = {};
              let marker = doc.objects[markerId];
              if (!marker) {
                doc.objects[markerId] = { geolocation: { lat, lng } };
                marker = doc.objects[markerId];
              }

              marker.geolocation = { lat, lng };
            });
          }
        );
      }
    });
  },
};
