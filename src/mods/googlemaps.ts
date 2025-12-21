import { LibraryMod } from "../mods";
import { forEachClass, hasMethodNames, injectIntoConstructor } from "../ast-helpers";

export const GOOGLEMAPS_MOD: LibraryMod = {
  keyword: "google.maps",
  mutate: (ast) => {
    forEachClass(ast, (classNode) => {
      // AdvancedMarkerElement detection: has addListener, setMap, dispose, connectedCallback
      if (hasMethodNames(classNode, ["addListener", "setMap", "dispose", "connectedCallback"])) {
        injectIntoConstructor(classNode, (self: any, options: any) => {
          self.__PIN_MARKER_ID__ = crypto.randomUUID().replace(/-/g, "");

          let position = null;
          const pos = options?.position;

          if (pos) {
            // Handle both LatLng objects and LatLngLiteral
            if (typeof pos.lat === "function") {
              position = { lat: pos.lat(), lng: pos.lng() };
            } else {
              position = { lat: pos.lat, lng: pos.lng };
            }
          }

          document.dispatchEvent(
            new CustomEvent("pin:message", {
              detail: {
                action: "update",
                objectId: self.__PIN_MARKER_ID__,
                type: "Marker",
                data: {
                  position,
                  mapId: options?.map?.__PIN_MAP_ID__ ?? null,
                },
              },
            })
          );
        });
      }
    });
  },
};
