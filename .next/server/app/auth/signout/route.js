/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "app/auth/signout/route";
exports.ids = ["app/auth/signout/route"];
exports.modules = {

/***/ "(rsc)/./app/auth/signout/route.ts":
/*!***********************************!*\
  !*** ./app/auth/signout/route.ts ***!
  \***********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   POST: () => (/* binding */ POST)\n/* harmony export */ });\n/* harmony import */ var _utils_supabase_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @/utils/supabase/server */ \"(rsc)/./utils/supabase/server.ts\");\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/server */ \"(rsc)/./node_modules/next/dist/api/server.js\");\n\n\nasync function POST(request) {\n    const requestUrl = new URL(request.url);\n    const supabase = await (0,_utils_supabase_server__WEBPACK_IMPORTED_MODULE_0__.createClient)() // Await here\n    ;\n    await supabase.auth.signOut();\n    return next_server__WEBPACK_IMPORTED_MODULE_1__.NextResponse.redirect(`${requestUrl.origin}/login`, {\n        status: 302\n    });\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvYXV0aC9zaWdub3V0L3JvdXRlLnRzIiwibWFwcGluZ3MiOiI7Ozs7OztBQUFzRDtBQUNaO0FBRW5DLGVBQWVFLEtBQUtDLE9BQWdCO0lBQ3pDLE1BQU1DLGFBQWEsSUFBSUMsSUFBSUYsUUFBUUcsR0FBRztJQUN0QyxNQUFNQyxXQUFXLE1BQU1QLG9FQUFZQSxHQUFHLGFBQWE7O0lBRW5ELE1BQU1PLFNBQVNDLElBQUksQ0FBQ0MsT0FBTztJQUUzQixPQUFPUixxREFBWUEsQ0FBQ1MsUUFBUSxDQUFDLEdBQUdOLFdBQVdPLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRTtRQUN6REMsUUFBUTtJQUNWO0FBQ0YiLCJzb3VyY2VzIjpbIi9Vc2Vycy9hbmRyZXdkYXZpZXMvUHJvamVjdHMvY3Jhc2hib2FyZF9uZXcvYXBwL2F1dGgvc2lnbm91dC9yb3V0ZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBjcmVhdGVDbGllbnQgfSBmcm9tIFwiQC91dGlscy9zdXBhYmFzZS9zZXJ2ZXJcIlxuaW1wb3J0IHsgTmV4dFJlc3BvbnNlIH0gZnJvbSBcIm5leHQvc2VydmVyXCJcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIFBPU1QocmVxdWVzdDogUmVxdWVzdCkge1xuICBjb25zdCByZXF1ZXN0VXJsID0gbmV3IFVSTChyZXF1ZXN0LnVybClcbiAgY29uc3Qgc3VwYWJhc2UgPSBhd2FpdCBjcmVhdGVDbGllbnQoKSAvLyBBd2FpdCBoZXJlXG5cbiAgYXdhaXQgc3VwYWJhc2UuYXV0aC5zaWduT3V0KClcblxuICByZXR1cm4gTmV4dFJlc3BvbnNlLnJlZGlyZWN0KGAke3JlcXVlc3RVcmwub3JpZ2lufS9sb2dpbmAsIHtcbiAgICBzdGF0dXM6IDMwMixcbiAgfSlcbn0iXSwibmFtZXMiOlsiY3JlYXRlQ2xpZW50IiwiTmV4dFJlc3BvbnNlIiwiUE9TVCIsInJlcXVlc3QiLCJyZXF1ZXN0VXJsIiwiVVJMIiwidXJsIiwic3VwYWJhc2UiLCJhdXRoIiwic2lnbk91dCIsInJlZGlyZWN0Iiwib3JpZ2luIiwic3RhdHVzIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./app/auth/signout/route.ts\n");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fauth%2Fsignout%2Froute&page=%2Fauth%2Fsignout%2Froute&appPaths=&pagePath=private-next-app-dir%2Fauth%2Fsignout%2Froute.ts&appDir=%2FUsers%2Fandrewdavies%2FProjects%2Fcrashboard_new%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fandrewdavies%2FProjects%2Fcrashboard_new&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!":
/*!****************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fauth%2Fsignout%2Froute&page=%2Fauth%2Fsignout%2Froute&appPaths=&pagePath=private-next-app-dir%2Fauth%2Fsignout%2Froute.ts&appDir=%2FUsers%2Fandrewdavies%2FProjects%2Fcrashboard_new%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fandrewdavies%2FProjects%2Fcrashboard_new&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \****************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   workAsyncStorage: () => (/* binding */ workAsyncStorage),\n/* harmony export */   workUnitAsyncStorage: () => (/* binding */ workUnitAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/route-kind */ \"(rsc)/./node_modules/next/dist/server/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _Users_andrewdavies_Projects_crashboard_new_app_auth_signout_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./app/auth/signout/route.ts */ \"(rsc)/./app/auth/signout/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"\"\nconst routeModule = new next_dist_server_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/auth/signout/route\",\n        pathname: \"/auth/signout\",\n        filename: \"route\",\n        bundlePath: \"app/auth/signout/route\"\n    },\n    resolvedPagePath: \"/Users/andrewdavies/Projects/crashboard_new/app/auth/signout/route.ts\",\n    nextConfigOutput,\n    userland: _Users_andrewdavies_Projects_crashboard_new_app_auth_signout_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { workAsyncStorage, workUnitAsyncStorage, serverHooks } = routeModule;\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        workAsyncStorage,\n        workUnitAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIvaW5kZXguanM/bmFtZT1hcHAlMkZhdXRoJTJGc2lnbm91dCUyRnJvdXRlJnBhZ2U9JTJGYXV0aCUyRnNpZ25vdXQlMkZyb3V0ZSZhcHBQYXRocz0mcGFnZVBhdGg9cHJpdmF0ZS1uZXh0LWFwcC1kaXIlMkZhdXRoJTJGc2lnbm91dCUyRnJvdXRlLnRzJmFwcERpcj0lMkZVc2VycyUyRmFuZHJld2RhdmllcyUyRlByb2plY3RzJTJGY3Jhc2hib2FyZF9uZXclMkZhcHAmcGFnZUV4dGVuc2lvbnM9dHN4JnBhZ2VFeHRlbnNpb25zPXRzJnBhZ2VFeHRlbnNpb25zPWpzeCZwYWdlRXh0ZW5zaW9ucz1qcyZyb290RGlyPSUyRlVzZXJzJTJGYW5kcmV3ZGF2aWVzJTJGUHJvamVjdHMlMkZjcmFzaGJvYXJkX25ldyZpc0Rldj10cnVlJnRzY29uZmlnUGF0aD10c2NvbmZpZy5qc29uJmJhc2VQYXRoPSZhc3NldFByZWZpeD0mbmV4dENvbmZpZ091dHB1dD0mcHJlZmVycmVkUmVnaW9uPSZtaWRkbGV3YXJlQ29uZmlnPWUzMCUzRCEiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7QUFBK0Y7QUFDdkM7QUFDcUI7QUFDcUI7QUFDbEc7QUFDQTtBQUNBO0FBQ0Esd0JBQXdCLHlHQUFtQjtBQUMzQztBQUNBLGNBQWMsa0VBQVM7QUFDdkI7QUFDQTtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQTtBQUNBLFlBQVk7QUFDWixDQUFDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0EsUUFBUSxzREFBc0Q7QUFDOUQ7QUFDQSxXQUFXLDRFQUFXO0FBQ3RCO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDMEY7O0FBRTFGIiwic291cmNlcyI6WyIiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwUm91dGVSb3V0ZU1vZHVsZSB9IGZyb20gXCJuZXh0L2Rpc3Qvc2VydmVyL3JvdXRlLW1vZHVsZXMvYXBwLXJvdXRlL21vZHVsZS5jb21waWxlZFwiO1xuaW1wb3J0IHsgUm91dGVLaW5kIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvcm91dGUta2luZFwiO1xuaW1wb3J0IHsgcGF0Y2hGZXRjaCBhcyBfcGF0Y2hGZXRjaCB9IGZyb20gXCJuZXh0L2Rpc3Qvc2VydmVyL2xpYi9wYXRjaC1mZXRjaFwiO1xuaW1wb3J0ICogYXMgdXNlcmxhbmQgZnJvbSBcIi9Vc2Vycy9hbmRyZXdkYXZpZXMvUHJvamVjdHMvY3Jhc2hib2FyZF9uZXcvYXBwL2F1dGgvc2lnbm91dC9yb3V0ZS50c1wiO1xuLy8gV2UgaW5qZWN0IHRoZSBuZXh0Q29uZmlnT3V0cHV0IGhlcmUgc28gdGhhdCB3ZSBjYW4gdXNlIHRoZW0gaW4gdGhlIHJvdXRlXG4vLyBtb2R1bGUuXG5jb25zdCBuZXh0Q29uZmlnT3V0cHV0ID0gXCJcIlxuY29uc3Qgcm91dGVNb2R1bGUgPSBuZXcgQXBwUm91dGVSb3V0ZU1vZHVsZSh7XG4gICAgZGVmaW5pdGlvbjoge1xuICAgICAgICBraW5kOiBSb3V0ZUtpbmQuQVBQX1JPVVRFLFxuICAgICAgICBwYWdlOiBcIi9hdXRoL3NpZ25vdXQvcm91dGVcIixcbiAgICAgICAgcGF0aG5hbWU6IFwiL2F1dGgvc2lnbm91dFwiLFxuICAgICAgICBmaWxlbmFtZTogXCJyb3V0ZVwiLFxuICAgICAgICBidW5kbGVQYXRoOiBcImFwcC9hdXRoL3NpZ25vdXQvcm91dGVcIlxuICAgIH0sXG4gICAgcmVzb2x2ZWRQYWdlUGF0aDogXCIvVXNlcnMvYW5kcmV3ZGF2aWVzL1Byb2plY3RzL2NyYXNoYm9hcmRfbmV3L2FwcC9hdXRoL3NpZ25vdXQvcm91dGUudHNcIixcbiAgICBuZXh0Q29uZmlnT3V0cHV0LFxuICAgIHVzZXJsYW5kXG59KTtcbi8vIFB1bGwgb3V0IHRoZSBleHBvcnRzIHRoYXQgd2UgbmVlZCB0byBleHBvc2UgZnJvbSB0aGUgbW9kdWxlLiBUaGlzIHNob3VsZFxuLy8gYmUgZWxpbWluYXRlZCB3aGVuIHdlJ3ZlIG1vdmVkIHRoZSBvdGhlciByb3V0ZXMgdG8gdGhlIG5ldyBmb3JtYXQuIFRoZXNlXG4vLyBhcmUgdXNlZCB0byBob29rIGludG8gdGhlIHJvdXRlLlxuY29uc3QgeyB3b3JrQXN5bmNTdG9yYWdlLCB3b3JrVW5pdEFzeW5jU3RvcmFnZSwgc2VydmVySG9va3MgfSA9IHJvdXRlTW9kdWxlO1xuZnVuY3Rpb24gcGF0Y2hGZXRjaCgpIHtcbiAgICByZXR1cm4gX3BhdGNoRmV0Y2goe1xuICAgICAgICB3b3JrQXN5bmNTdG9yYWdlLFxuICAgICAgICB3b3JrVW5pdEFzeW5jU3RvcmFnZVxuICAgIH0pO1xufVxuZXhwb3J0IHsgcm91dGVNb2R1bGUsIHdvcmtBc3luY1N0b3JhZ2UsIHdvcmtVbml0QXN5bmNTdG9yYWdlLCBzZXJ2ZXJIb29rcywgcGF0Y2hGZXRjaCwgIH07XG5cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWFwcC1yb3V0ZS5qcy5tYXAiXSwibmFtZXMiOltdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fauth%2Fsignout%2Froute&page=%2Fauth%2Fsignout%2Froute&appPaths=&pagePath=private-next-app-dir%2Fauth%2Fsignout%2Froute.ts&appDir=%2FUsers%2Fandrewdavies%2FProjects%2Fcrashboard_new%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fandrewdavies%2FProjects%2Fcrashboard_new&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!\n");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js?server=true!":
/*!******************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js?server=true! ***!
  \******************************************************************************************************/
/***/ (() => {



/***/ }),

/***/ "(rsc)/./utils/supabase/server.ts":
/*!**********************************!*\
  !*** ./utils/supabase/server.ts ***!
  \**********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   createClient: () => (/* binding */ createClient)\n/* harmony export */ });\n/* harmony import */ var _supabase_ssr__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @supabase/ssr */ \"(rsc)/./node_modules/@supabase/ssr/dist/module/index.js\");\n/* harmony import */ var next_headers__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/headers */ \"(rsc)/./node_modules/next/dist/api/headers.js\");\n\n\nasync function createClient() {\n    const cookieStore = await (0,next_headers__WEBPACK_IMPORTED_MODULE_1__.cookies)() // Await cookies()\n    ;\n    return (0,_supabase_ssr__WEBPACK_IMPORTED_MODULE_0__.createServerClient)(\"https://txlrpvmrvmxniulfcqfu.supabase.co\", \"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4bHJwdm1ydm14bml1bGZjcWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM1MDg4MzcsImV4cCI6MjA1OTA4NDgzN30.IKKA_G1x5sX7y7ZM5P_BmNIgNFVkxf4UmvyCDu3YuaU\", {\n        cookies: {\n            async get (name) {\n                return (await cookieStore.get(name))?.value // Await get()\n                ;\n            },\n            async set (name, value, options) {\n                await cookieStore.set({\n                    name,\n                    value,\n                    ...options\n                }) // Await set()\n                ;\n            },\n            async remove (name, options) {\n                await cookieStore.set({\n                    name,\n                    value: \"\",\n                    ...options\n                }) // Await set()\n                ;\n            }\n        }\n    });\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi91dGlscy9zdXBhYmFzZS9zZXJ2ZXIudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQWtEO0FBQ1o7QUFFL0IsZUFBZUU7SUFDcEIsTUFBTUMsY0FBYyxNQUFNRixxREFBT0EsR0FBRyxrQkFBa0I7O0lBQ3RELE9BQU9ELGlFQUFrQkEsQ0FBQ0ksMENBQW9DLEVBQUdBLGtOQUF5QyxFQUFHO1FBQzNHSCxTQUFTO1lBQ1AsTUFBTU8sS0FBSUMsSUFBSTtnQkFDWixPQUFRLE9BQU1OLFlBQVlLLEdBQUcsQ0FBQ0MsS0FBSSxHQUFJQyxNQUFNLGNBQWM7O1lBQzVEO1lBQ0EsTUFBTUMsS0FBSUYsSUFBSSxFQUFFQyxLQUFLLEVBQUVFLE9BQU87Z0JBQzVCLE1BQU1ULFlBQVlRLEdBQUcsQ0FBQztvQkFBRUY7b0JBQU1DO29CQUFPLEdBQUdFLE9BQU87Z0JBQUMsR0FBRyxjQUFjOztZQUNuRTtZQUNBLE1BQU1DLFFBQU9KLElBQUksRUFBRUcsT0FBTztnQkFDeEIsTUFBTVQsWUFBWVEsR0FBRyxDQUFDO29CQUFFRjtvQkFBTUMsT0FBTztvQkFBSSxHQUFHRSxPQUFPO2dCQUFDLEdBQUcsY0FBYzs7WUFDdkU7UUFDRjtJQUNGO0FBQ0YiLCJzb3VyY2VzIjpbIi9Vc2Vycy9hbmRyZXdkYXZpZXMvUHJvamVjdHMvY3Jhc2hib2FyZF9uZXcvdXRpbHMvc3VwYWJhc2Uvc2VydmVyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGNyZWF0ZVNlcnZlckNsaWVudCB9IGZyb20gXCJAc3VwYWJhc2Uvc3NyXCJcbmltcG9ydCB7IGNvb2tpZXMgfSBmcm9tIFwibmV4dC9oZWFkZXJzXCJcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUNsaWVudCgpIHsgLy8gQ2hhbmdlZCB0byBhc3luY1xuICBjb25zdCBjb29raWVTdG9yZSA9IGF3YWl0IGNvb2tpZXMoKSAvLyBBd2FpdCBjb29raWVzKClcbiAgcmV0dXJuIGNyZWF0ZVNlcnZlckNsaWVudChwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19TVVBBQkFTRV9VUkwhLCBwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19TVVBBQkFTRV9BTk9OX0tFWSEsIHtcbiAgICBjb29raWVzOiB7XG4gICAgICBhc3luYyBnZXQobmFtZSkgeyAvLyBBZGQgYXN5bmNcbiAgICAgICAgcmV0dXJuIChhd2FpdCBjb29raWVTdG9yZS5nZXQobmFtZSkpPy52YWx1ZSAvLyBBd2FpdCBnZXQoKVxuICAgICAgfSxcbiAgICAgIGFzeW5jIHNldChuYW1lLCB2YWx1ZSwgb3B0aW9ucykgeyAvLyBBZGQgYXN5bmNcbiAgICAgICAgYXdhaXQgY29va2llU3RvcmUuc2V0KHsgbmFtZSwgdmFsdWUsIC4uLm9wdGlvbnMgfSkgLy8gQXdhaXQgc2V0KClcbiAgICAgIH0sXG4gICAgICBhc3luYyByZW1vdmUobmFtZSwgb3B0aW9ucykgeyAvLyBBZGQgYXN5bmNcbiAgICAgICAgYXdhaXQgY29va2llU3RvcmUuc2V0KHsgbmFtZSwgdmFsdWU6IFwiXCIsIC4uLm9wdGlvbnMgfSkgLy8gQXdhaXQgc2V0KClcbiAgICAgIH0sXG4gICAgfSxcbiAgfSlcbn0iXSwibmFtZXMiOlsiY3JlYXRlU2VydmVyQ2xpZW50IiwiY29va2llcyIsImNyZWF0ZUNsaWVudCIsImNvb2tpZVN0b3JlIiwicHJvY2VzcyIsImVudiIsIk5FWFRfUFVCTElDX1NVUEFCQVNFX1VSTCIsIk5FWFRfUFVCTElDX1NVUEFCQVNFX0FOT05fS0VZIiwiZ2V0IiwibmFtZSIsInZhbHVlIiwic2V0Iiwib3B0aW9ucyIsInJlbW92ZSJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./utils/supabase/server.ts\n");

/***/ }),

/***/ "(ssr)/./node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js?server=true!":
/*!******************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-flight-client-entry-loader.js?server=true! ***!
  \******************************************************************************************************/
/***/ (() => {



/***/ }),

/***/ "../app-render/after-task-async-storage.external":
/*!***********************************************************************************!*\
  !*** external "next/dist/server/app-render/after-task-async-storage.external.js" ***!
  \***********************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/server/app-render/after-task-async-storage.external.js");

/***/ }),

/***/ "../app-render/work-async-storage.external":
/*!*****************************************************************************!*\
  !*** external "next/dist/server/app-render/work-async-storage.external.js" ***!
  \*****************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/server/app-render/work-async-storage.external.js");

/***/ }),

/***/ "./work-unit-async-storage.external":
/*!**********************************************************************************!*\
  !*** external "next/dist/server/app-render/work-unit-async-storage.external.js" ***!
  \**********************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/server/app-render/work-unit-async-storage.external.js");

/***/ }),

/***/ "buffer":
/*!*************************!*\
  !*** external "buffer" ***!
  \*************************/
/***/ ((module) => {

"use strict";
module.exports = require("buffer");

/***/ }),

/***/ "crypto":
/*!*************************!*\
  !*** external "crypto" ***!
  \*************************/
/***/ ((module) => {

"use strict";
module.exports = require("crypto");

/***/ }),

/***/ "events":
/*!*************************!*\
  !*** external "events" ***!
  \*************************/
/***/ ((module) => {

"use strict";
module.exports = require("events");

/***/ }),

/***/ "http":
/*!***********************!*\
  !*** external "http" ***!
  \***********************/
/***/ ((module) => {

"use strict";
module.exports = require("http");

/***/ }),

/***/ "https":
/*!************************!*\
  !*** external "https" ***!
  \************************/
/***/ ((module) => {

"use strict";
module.exports = require("https");

/***/ }),

/***/ "net":
/*!**********************!*\
  !*** external "net" ***!
  \**********************/
/***/ ((module) => {

"use strict";
module.exports = require("net");

/***/ }),

/***/ "next/dist/compiled/next-server/app-page.runtime.dev.js":
/*!*************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-page.runtime.dev.js" ***!
  \*************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/next-server/app-page.runtime.dev.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-route.runtime.dev.js":
/*!**************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-route.runtime.dev.js" ***!
  \**************************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/next-server/app-route.runtime.dev.js");

/***/ }),

/***/ "punycode":
/*!***************************!*\
  !*** external "punycode" ***!
  \***************************/
/***/ ((module) => {

"use strict";
module.exports = require("punycode");

/***/ }),

/***/ "stream":
/*!*************************!*\
  !*** external "stream" ***!
  \*************************/
/***/ ((module) => {

"use strict";
module.exports = require("stream");

/***/ }),

/***/ "tls":
/*!**********************!*\
  !*** external "tls" ***!
  \**********************/
/***/ ((module) => {

"use strict";
module.exports = require("tls");

/***/ }),

/***/ "url":
/*!**********************!*\
  !*** external "url" ***!
  \**********************/
/***/ ((module) => {

"use strict";
module.exports = require("url");

/***/ }),

/***/ "zlib":
/*!***********************!*\
  !*** external "zlib" ***!
  \***********************/
/***/ ((module) => {

"use strict";
module.exports = require("zlib");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/@supabase","vendor-chunks/tr46","vendor-chunks/whatwg-url","vendor-chunks/cookie","vendor-chunks/webidl-conversions"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?name=app%2Fauth%2Fsignout%2Froute&page=%2Fauth%2Fsignout%2Froute&appPaths=&pagePath=private-next-app-dir%2Fauth%2Fsignout%2Froute.ts&appDir=%2FUsers%2Fandrewdavies%2FProjects%2Fcrashboard_new%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fandrewdavies%2FProjects%2Fcrashboard_new&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();