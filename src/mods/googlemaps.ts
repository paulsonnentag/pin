import { type API } from "../api";
import {
  classContainsString,
  forEachClass,
  hasMethodNames,
  injectIntoConstructor,
} from "../ast-helpers";
import { LibraryMod } from "../mods";

export const GOOGLEMAPS_MOD: LibraryMod = {
  keyword: "google.maps",
  mutate: (ast) => {
    forEachClass(ast, (classNode) => {
      if (isAdvancedMarkerElement(classNode)) {
        injectIntoConstructor(
          classNode,
          async (api: API, self: any, options: any) => {
            const markerId = crypto.randomUUID().replace(/-/g, "");
            self.__PIN_MARKER_ID__ = markerId;

            const position = options?.position;
            if (!position) return;

            const lat =
              typeof position.lat === "function"
                ? position.lat()
                : position.lat;
            const lng =
              typeof position.lng === "function"
                ? position.lng()
                : position.lng;

            const handle = await api.getTabDocHandle();
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

/**
 * Detect AdvancedMarkerElement class using multiple signals:
 * - Web Component lifecycle methods (connectedCallback, disconnectedCallback)
 * - Google Maps specific methods (addListener)
 * - Marker-specific properties (position, map)
 * - GMP-specific properties unique to AdvancedMarkerElement (gmpDraggable, gmpClickable)
 * - String literal "AdvancedMarkerElement" in constructor
 */
const isAdvancedMarkerElement = (classNode: any): boolean => {
  // Must have Google Maps event method
  return (
    hasMethodNames(classNode, [
      "connectedCallback",
      "addListener",
      "position",
      "gmpDraggable",
      "gmpClickable",
      "collisionBehavior",
    ]) && classContainsString(classNode, "AdvancedMarkerElement")
  );
};
