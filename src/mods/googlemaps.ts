import {
  classContainsString,
  forEachClass,
  hasMethodNames,
  injectIntoConstructor,
  type InjectionFunction,
} from "../ast-helpers";
import { LibraryMod } from "../mods";

export const GOOGLEMAPS_MOD: LibraryMod = {
  keyword: "google.maps",
  mutate: (ast) => {
    forEachClass(ast, (classNode) => {
      if (isAdvancedMarkerElement(classNode)) {
        console.log("[GoogleMaps] Found AdvancedMarkerElement class");

        const injection: InjectionFunction = (
          { tabDocHandle },
          self,
          options
        ) => {
          // Generate unique marker ID
          self.__PIN_MARKER_ID__ = crypto.randomUUID().replace(/-/g, "");

          const position = options?.position;
          if (!position) return;

          // Update the tab document with marker info
          tabDocHandle.change((doc: any) => {
            doc.objects[self.__PIN_MARKER_ID__] = {
              type: "Marker",
              data: { position },
              timestamp: Date.now(),
            };
          });
        };

        injectIntoConstructor(classNode, injection);
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
