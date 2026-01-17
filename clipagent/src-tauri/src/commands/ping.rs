use hyper::{Body, Response};

pub fn handle_ping() -> Response<Body> {
    Response::new(Body::from("{\"status\":\"ok\"}"))
}