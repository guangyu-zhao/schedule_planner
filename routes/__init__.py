from routes.main import main_bp
from routes.events import events_bp
from routes.timer import timer_bp
from routes.notes import notes_bp
from routes.stats import stats_bp


def register_blueprints(app):
    app.register_blueprint(main_bp)
    app.register_blueprint(events_bp)
    app.register_blueprint(timer_bp)
    app.register_blueprint(notes_bp)
    app.register_blueprint(stats_bp)
