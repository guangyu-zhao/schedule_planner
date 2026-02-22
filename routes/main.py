from flask import Blueprint, render_template, redirect, session

main_bp = Blueprint("main", __name__)


@main_bp.route("/")
def index():
    if not session.get("user_id"):
        return redirect("/login")
    return render_template("index.html")


@main_bp.route("/login")
def login_page():
    if session.get("user_id"):
        return redirect("/")
    return render_template("auth.html")
